import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const isToken = (value: unknown): value is string =>
  typeof value === 'string' && /^(Expo|Exponent)PushToken\[[^\]\s]{10,200}\]$/.test(value);

/** Registers the signed-in device; independent of the passenger/driver screen. */
export default function PushNotificationBridge() {
  const authToken = useAuthStore(s => s.token);
  const hydrated = useAuthStore(s => s._hasHydrated);
  const role = useAuthStore(s => s.user?.role);

  useEffect(() => {
    if (!hydrated || !authToken || Platform.OS === 'web' || !apiUrl) return;
    let cancelled = false;
    let deviceToken: string | null = null;
    const register = async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('ride-reminders', {
            name: 'Ride reminders',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'default',
            vibrationPattern: [0, 300, 200, 300],
          });
        }
        const current = await Notifications.getPermissionsAsync();
        const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
        if (!permission.granted) return;
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (typeof projectId !== 'string') {
          console.warn('Push setup: Expo EAS project ID missing');
          return;
        }
        deviceToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (cancelled || !isToken(deviceToken)) return;
        const response = await fetch(`${apiUrl}/api/notifications/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token: deviceToken, platform: Platform.OS }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log('Push registration successful');
      } catch (err) { console.warn('Push registration pending:', err); }
    };
    void register();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void register();
    });
    return () => {
      cancelled = true;
      subscription.remove();
      if (deviceToken && isToken(deviceToken)) {
        // Uses the captured old JWT on logout; cannot remove a different user's token.
        void fetch(`${apiUrl}/api/notifications/register`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token: deviceToken }),
        }).catch(() => {});
      }
    };
  }, [authToken, hydrated]);

  useEffect(() => {
    if (!hydrated || !authToken) return;
    const openRide = (response: Notifications.NotificationResponse) => {
      const kind = response.notification.request.content.data?.kind;
      if (kind !== 'ride_reminder') return;
      router.push(role === 'Driver' ? '/(root)/driver' : '/(root)/(tabs)/rides');
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openRide);
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) openRide(response);
    }).catch(() => {});
    return () => subscription.remove();
  }, [authToken, hydrated, role]);

  return null;
}
