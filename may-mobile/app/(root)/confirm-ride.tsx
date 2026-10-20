import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CustomButton from "@/components/CustomButton";
import RideLayout from "@/components/RideLayout";
import { fetchAPI } from "@/lib/fetch";
import { useLocationStore } from "@/store";

type BookingMode = "Solo" | "Sharing";
type AvailableCab = {
  driverId: string;
  driverName: string;
  vehicleDetails: string | null;
  category: string;
  seatCapacity: number;
  seatsAvailable: number;
  distanceKm: number;
  fare: number;
  joiningGroup: boolean;
};

const FARES: Record<BookingMode, number> = { Sharing: 15, Solo: 30 };

const ConfirmRide = () => {
  const {
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();
  const [bookingMode, setBookingMode] = useState<BookingMode>("Sharing");
  const [cabs, setCabs] = useState<AvailableCab[]>([]);
  const [selectedCab, setSelectedCab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const loadCabs = useCallback(async () => {
    const current = ++requestId.current;
    setSelectedCab(null);
    setError("");
    if (
      typeof userLatitude !== "number" ||
      typeof userLongitude !== "number" ||
      typeof destinationLatitude !== "number" ||
      typeof destinationLongitude !== "number"
    ) {
      setCabs([]);
      setError("Choose valid pickup and destination locations first.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({
        lat: String(userLatitude),
        lng: String(userLongitude),
        dropoffLat: String(destinationLatitude),
        dropoffLng: String(destinationLongitude),
        radius: "10",
        bookingMode,
        category: "Standard",
      });
      const data = await fetchAPI(`/api/rides/available-cabs?${query}`);
      if (!Array.isArray(data)) throw new Error("Unexpected availability response");
      if (current === requestId.current) setCabs(data);
    } catch (err) {
      if (current === requestId.current) {
        setCabs([]);
        setError(err instanceof Error ? err.message : "Could not load available taxis");
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [bookingMode, userLatitude, userLongitude, destinationLatitude, destinationLongitude]);

  useEffect(() => {
    loadCabs();
    return () => { requestId.current += 1; };
  }, [loadCabs]);

  const handleContinue = () => {
    const cab = cabs.find((item) => String(item.driverId) === selectedCab);
    if (!cab) return;
    router.push({
      pathname: "/(root)/book-ride",
      params: {
        driverId: String(cab.driverId),
        driverName: cab.driverName,
        vehicleDetails: cab.vehicleDetails ?? "",
        bookingMode,
      },
    });
  };

  return (
    <RideLayout title="Choose a May Taxi" snapPoints={["65%", "85%"]}>
      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 35 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xl font-JakartaBold mt-3">How would you like to travel?</Text>
        <View className="flex-row mt-4 mb-3" style={{ gap: 12 }}>
          {(["Sharing", "Solo"] as BookingMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setBookingMode(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected: bookingMode === mode }}
              className={`flex-1 rounded-xl border-2 p-4 ${
                bookingMode === mode ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
              }`}
            >
              <Text className="text-base font-JakartaBold">{mode}</Text>
              <Text className="text-lg font-JakartaBold mt-1">N${FARES[mode]}</Text>
              <Text className="text-xs text-gray-500 mt-1">
                {mode === "Sharing" ? "Per passenger" : "Exclusive taxi"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text className="text-sm text-gray-600 mb-4">
          {bookingMode === "Sharing"
            ? "Share with passengers heading to nearby pickup and destination areas. Matching is approximate for this academic demo."
            : "Reserve the entire Standard taxi for your ride."}
        </Text>

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color="#0286FF" />
            <Text className="mt-3 text-gray-500">Checking taxi availability...</Text>
          </View>
        ) : error ? (
          <View className="items-center py-8">
            <Text className="text-red-600 text-center">{error}</Text>
          </View>
        ) : cabs.length === 0 ? (
          <View className="items-center py-10">
            <Text className="text-lg font-JakartaBold">No eligible taxis available</Text>
            <Text className="text-gray-500 text-center mt-2">
              Try another mode or refresh. Sharing is limited to taxis with matching pickup and destination areas.
            </Text>
          </View>
        ) : (
          <>
            <Text className="font-JakartaSemiBold mb-3">
              {cabs.length} eligible {cabs.length === 1 ? "taxi" : "taxis"}
            </Text>
            {cabs.map((cab) => {
              const id = String(cab.driverId);
              const selected = selectedCab === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setSelectedCab(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`rounded-2xl p-4 mb-3 border-2 bg-white ${
                    selected ? "border-blue-500" : "border-gray-200"
                  }`}
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                      <Text className="text-lg font-JakartaBold">{cab.driverName || "May Driver"}</Text>
                      <Text className="text-sm text-gray-500 mt-1">
                        {cab.vehicleDetails || "Standard May Taxi"}
                      </Text>
                      <Text className="text-sm text-gray-500 mt-1">
                        {Number.isFinite(cab.distanceKm) ? `${cab.distanceKm.toFixed(1)} km away` : "Distance unavailable"}
                      </Text>
                      {bookingMode === "Sharing" && (
                        <Text className="text-sm text-gray-600 mt-2">
                          {cab.seatsAvailable} seats left
                          {cab.joiningGroup ? " · Joining a compatible group" : " · New shared trip"}
                        </Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-lg font-JakartaBold">N${FARES[bookingMode]}</Text>
                      <Text className={`mt-3 font-JakartaBold ${selected ? "text-blue-500" : "text-gray-400"}`}>
                        {selected ? "Selected" : "Select"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <TouchableOpacity onPress={loadCabs} disabled={loading} className="items-center py-3">
          <Text className="text-blue-500 font-JakartaSemiBold">Refresh available taxis</Text>
        </TouchableOpacity>
        <CustomButton
          title="Continue to Booking"
          onPress={handleContinue}
          disabled={!selectedCab || loading}
          className="mt-4"
        />
      </ScrollView>
    </RideLayout>
  );
};

export default ConfirmRide;
