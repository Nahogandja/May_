/**
 * ES4WOMEN&CHILDREN — local scheduled ride reminders (no Firebase/FCM).
 * The signed-in phone must learn about a ride while online before it can
 * schedule a notification to appear when the app is closed.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { fetchAPI } from '@/lib/fetch';
import { useAuthStore } from '@/store/auth';

const KIND = 'es4w_local_ride_reminder';
const CHANNEL = 'ride-reminders-v2';
const BEFORE_PICKUP_MS = 15 * 60 * 1000;
const POLL_MS = 60 * 1000;
const MAX_SCHEDULED = 50;

type ScheduledRide = {
  id: string | number;
  scheduled_for?: string | null;
  status?: string | null;
};

type ReminderData = {
  kind?: unknown;
  userId?: unknown;
  rideId?: unknown;
  role?: unknown;
  scheduledFor?: unknown;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const isOurNotification = (data: ReminderData | undefined) => data?.kind === KIND;
const makeKey = (userId: string, role: string, rideId: string, pickupMs: number) =>
  `${userId}|${role}|${rideId}|${pickupMs}`;

async function clearLocalRideReminders() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter(request =>
    isOurNotification(request.content.data as ReminderData)
  ).map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Scheduled ride reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 150, 250],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function syncReminders(userId: string, role: 'Passenger' | 'Driver', isCurrent: () => boolean) {
  // Fetch FIRST. A temporary network failure must never delete reminders
  // successfully scheduled during an earlier sync.
  const result = await fetchAPI(role === 'Driver' ? '/api/driver/rides' : '/api/rides/my-rides');
  if (!isCurrent()) return;
  const rides: ScheduledRide[] = Array.isArray(result)
    ? result
    : Array.isArray(result?.data) ? result.data
    : Array.isArray(result?.rides) ? result.rides : [];

  const now = Date.now();
  const desired = new Map<string, {rideId: string; pickup: number}>();
  for (const ride of rides) {
    if (String(ride.status || '').toLowerCase() !== 'pending' || !ride.scheduled_for) continue;
    const pickup = new Date(ride.scheduled_for).getTime();
    if (!Number.isFinite(pickup) || pickup <= now + 4000) continue;
    const rideId = String(ride.id);
    if (!rideId) continue;
    desired.set(makeKey(userId, role, rideId, pickup), {rideId, pickup});
  }
  const toSchedule = [...desired.entries()]
    .sort((a, b) => a[1].pickup - b[1].pickup)
    .slice(0, MAX_SCHEDULED);
  const desiredKeys = new Set(toSchedule.map(([key]) => key));
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const existing = new Set<string>();
  for (const request of pending) {
    if (!isCurrent()) return;
    const data = request.content.data as ReminderData | undefined;
    if (!isOurNotification(data)) continue;
    const key = makeKey(String(data?.userId), String(data?.role),
      String(data?.rideId), Number(data?.scheduledFor));
    if (!desiredKeys.has(key) || existing.has(key)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    } else {
      existing.add(key);
    }
  }
  for (const [key, {rideId, pickup}] of toSchedule) {
    if (!isCurrent()) return;
    if (existing.has(key)) continue;
    // If the device first learns of the booking inside the final 15-minute
    // window, show the reminder shortly afterwards, never after pickup.
    const fireAt = Math.max(now + 2500, pickup - BEFORE_PICKUP_MS);
    if (fireAt >= pickup) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: role === 'Driver' ? 'Passenger pickup approaching' : 'Your ride is in 15 minutes',
        body: role === 'Driver'
          ? 'Your scheduled passenger pickup is approaching. Open ES4WOMEN&CHILDREN for trip details.'
          : 'Your scheduled ride is approaching. Open ES4WOMEN&CHILDREN for trip details.',
        data: {kind: KIND, userId, role, rideId, scheduledFor: pickup},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
        ...(Platform.OS === 'android' ? {channelId: CHANNEL} : {}),
      },
    });
  }
}

export default function LocalRideReminderBridge() {
  const hydrated = useAuthStore(state => state._hasHydrated);
  const authToken = useAuthStore(state => state.token);
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.user?.role);
  const nav = useRootNavigationState();
  const handledResponse = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || Platform.OS === 'web') return;
    if (!authToken || !userId || (role !== 'Passenger' && role !== 'Driver')) {
      // Cancel pending reminders after sign-out or a change of account.
      void clearLocalRideReminders().catch(error => console.warn('Reminder cleanup:', error));
      return;
    }
    let stopped = false;
    let busy = false;
    const run = async () => {
      if (stopped || busy || AppState.currentState !== 'active') return;
      busy = true;
      try {
        if (await ensurePermission() && !stopped) {
          const isCurrent = () => !stopped && useAuthStore.getState().token === authToken;
          await syncReminders(userId, role, isCurrent);
        }
      } catch (error) {
        console.warn('Local ride reminder sync will retry:', error);
      } finally { busy = false; }
    };
    void run();
    const interval = setInterval(() => void run(), POLL_MS);
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void run();
    });
    return () => {
      stopped = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [hydrated, authToken, userId, role]);

  useEffect(() => {
    if (!hydrated || !authToken || !userId || !nav?.key) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as ReminderData | undefined;
      if (!isOurNotification(data) || data?.userId !== userId) return;
      const identifier = response.notification.request.identifier;
      if (handledResponse.current === identifier) return;
      handledResponse.current = identifier;
      router.push(role === 'Driver' ? '/(root)/driver' : '/(root)/(tabs)/rides');
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    return () => subscription.remove();
  }, [hydrated, authToken, userId, role, nav?.key]);

  return null;
}
