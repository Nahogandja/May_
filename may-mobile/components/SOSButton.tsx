import * as Location from "expo-location";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { fetchAPI } from "@/lib/fetch";

type Props = {
  rideId: string;
  fallbackLatitude?: number | null;
  fallbackLongitude?: number | null;
  compact?: boolean;
  role?: "Passenger" | "Driver";
  onRecorded?: () => void;
};

/**
 * SOS creates a MAY admin incident. Optional SMS is attempted only when backend Twilio credentials exist.
 * Police calls require a human dispatcher.
 */
export default function SOSButton({ rideId, fallbackLatitude, fallbackLongitude, compact = false, role = "Passenger", onRecorded }: Props) {
  const [sending, setSending] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const activate = async (affectedParties: "Passenger" | "Both" = "Passenger") => {
    if (sending) return;
    setSending(true);
    try {
      // Last known coordinates may be unavailable; never block SOS on GPS permission.
      const cached = await Promise.race<Location.LocationObject | null>([
        Location.getLastKnownPositionAsync({ maxAge: 60_000 })
          .catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);
      const cachedLat = cached?.coords.latitude;
      const cachedLng = cached?.coords.longitude;
      const hasCached = typeof cachedLat === "number" && typeof cachedLng === "number" &&
        Number.isFinite(cachedLat) && Number.isFinite(cachedLng);
      const hasPickup = typeof fallbackLatitude === "number" &&
        typeof fallbackLongitude === "number" && Number.isFinite(fallbackLatitude) &&
        Number.isFinite(fallbackLongitude);

      const payload = {
        rideId,
        affectedParties,
        ...(hasCached ? {
          latitude: cachedLat,
          longitude: cachedLng,
          locationSource: "last_known",
        } : hasPickup ? {
          latitude: fallbackLatitude,
          longitude: fallbackLongitude,
          locationSource: "pickup",
        } : { locationSource: "unavailable" }),
      };
      const result=await fetchAPI(role === "Driver" ? "/api/driver/emergency" : "/api/rides/emergency", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setRecorded(true);
      onRecorded?.();
      Alert.alert(
        "SOS submitted to ES4WOMEN&CHILDREN admin",
        `Your emergency has been recorded. Trusted-contact SMS: ${result?.emergencyContactSmsStatus || result?.driverContactSmsStatus || "unknown"}. Police have NOT been contacted automatically. Call local emergency services directly if in immediate danger.`,
      );
    } catch (error) {
      Alert.alert(
        "SOS could not be recorded",
        (error instanceof Error ? error.message : "Please try again") +
          ". Call emergency services directly if in danger.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View className={compact
      ? "rounded-xl border border-red-300 bg-red-50 p-2"
      : "mt-4 w-full rounded-xl border border-red-200 bg-red-50 p-3"}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record SOS incident for this ride"
        onPress={() => activate(role === "Driver" ? "Both" : "Passenger")}
        disabled={sending}
        className={compact
          ? "min-h-12 items-center justify-center rounded-lg bg-red-600 px-5 py-2"
          : "min-h-14 items-center justify-center rounded-xl bg-red-600 px-4 py-3"}
      >
        {sending ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-lg font-JakartaBold text-white">
            {compact ? "SOS" : recorded ? "SOS — Send another alert" : "SOS — EMERGENCY"}
          </Text>
        )}
      </Pressable>
      {!compact && role === "Passenger" && <Pressable onPress={()=>activate("Both")} disabled={sending}
        accessibilityRole="button" accessibilityLabel="SOS for both passenger and driver"
        style={{padding:13,marginTop:9,backgroundColor:"#FEE2E2",borderRadius:9,alignItems:"center",borderWidth:1,borderColor:"#FCA5A5"}}>
        <Text style={{color:"#B91C1C",fontWeight:"800"}}>SOS — both passenger and driver at risk</Text>
      </Pressable>}
      {!compact && (
        <Text className="mt-2 text-center text-xs text-red-800">
          Notifies MAY admin. SMS requires configured provider; police are not called automatically.
        </Text>
      )}
      {compact && <Text className="text-center text-xs text-red-800">SOS</Text>}
    </View>
  );
}
