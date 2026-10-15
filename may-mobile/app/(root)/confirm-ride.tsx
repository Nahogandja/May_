
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

type AvailableCab = {
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleDetails: string | null;
  category: string;
  bookingMode: string;
  seatCapacity: number;
  seatsAvailable: number;
  distanceKm: number;
  latitude: number;
  longitude: number;
};

const ConfirmRide = () => {
  const { userLatitude, userLongitude } = useLocationStore();

  const [cabs, setCabs] = useState<AvailableCab[]>([]);
  const [selectedCab, setSelectedCab] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCabs = useCallback(async () => {
    if (
      typeof userLatitude !== "number" ||
      typeof userLongitude !== "number"
    ) {
      setError("Pickup location is unavailable.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await fetchAPI(
        `/api/rides/available-cabs?lat=${userLatitude}&lng=${userLongitude}&radius=10&bookingMode=Solo&category=Standard`
      );

      if (!Array.isArray(result)) {
        throw new Error("Invalid taxi availability response.");
      }

      setCabs(result);

      // Prevent retaining a selection that is no longer available.
      setSelectedCab(null);
    } catch (err: any) {
      setCabs([]);
      setSelectedCab(null);
      setError(
        err?.message || "Could not load available May taxis."
      );
    } finally {
      setLoading(false);
    }
  }, [userLatitude, userLongitude]);

  useEffect(() => {
    loadCabs();
  }, [loadCabs]);

  const handleContinue = () => {
    const cab = cabs.find(
      (item) => String(item.driverId) === selectedCab
    );

    if (!cab) {
      return;
    }

    router.push({
      pathname: "/(root)/book-ride",
      params: {
        driverId: String(cab.driverId),
        driverName: cab.driverName,
        vehicleDetails: cab.vehicleDetails ?? "",
      },
    });
  };

  return (
    <RideLayout
      title="Choose a May Taxi"
      snapPoints={["65%", "85%"]}
    >
      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 30,
        }}
      >
        <Text className="text-xl font-JakartaBold mt-3">
          Choose your taxi
        </Text>

        <Text className="text-sm text-gray-500 mt-2">
          Standard Solo - N$30 per ride
        </Text>

        <Text className="text-sm text-gray-500 mt-1 mb-5">
          The entire taxi is reserved for your booking.
        </Text>

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator
              size="large"
              color="#0286FF"
            />
            <Text className="mt-3 text-gray-500">
              Checking available May taxis...
            </Text>
          </View>
        ) : error ? (
          <View className="items-center py-8">
            <Text className="text-red-500 text-center">
              {error}
            </Text>
          </View>
        ) : cabs.length === 0 ? (
          <View className="items-center py-10">
            <Text className="text-lg font-JakartaBold">
              No May taxis available
            </Text>
            <Text className="text-gray-500 text-center mt-2">
              No Standard Solo taxis are currently available
              within 10 km of your pickup location.
            </Text>
          </View>
        ) : (
          <>
            <Text className="font-JakartaSemiBold mb-3">
              {cabs.length} available{" "}
              {cabs.length === 1 ? "taxi" : "taxis"}
            </Text>

            {cabs.map((cab) => {
              const id = String(cab.driverId);
              const selected = selectedCab === id;

              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setSelectedCab(id)}
                  activeOpacity={0.8}
                  className={`rounded-2xl p-4 mb-3 border-2 bg-white ${
                    selected
                      ? "border-blue-500"
                      : "border-gray-200"
                  }`}
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <Text className="text-lg font-JakartaBold">
                        {cab.driverName || "May Driver"}
                      </Text>

                      <Text className="text-sm text-gray-500 mt-1">
                        {cab.vehicleDetails ||
                          "Standard May Taxi"}
                      </Text>

                      <Text className="text-sm text-gray-500 mt-1">
                        {Number.isFinite(cab.distanceKm)
                          ? `${cab.distanceKm.toFixed(1)} km away`
                          : "Distance unavailable"}
                      </Text>

                      <Text className="text-sm mt-2 font-JakartaSemiBold">
                        Standard • Solo
                      </Text>
                    </View>

                    <View className="items-end">
                      <Text className="text-lg font-JakartaBold">
                        N$30
                      </Text>

                      <Text
                        className={`mt-3 font-JakartaBold ${
                          selected
                            ? "text-blue-500"
                            : "text-gray-400"
                        }`}
                      >
                        {selected ? "Selected" : "Select"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <TouchableOpacity
          onPress={loadCabs}
          disabled={loading}
          className="items-center py-3"
        >
          <Text className="text-blue-500 font-JakartaSemiBold">
            Refresh available taxis
          </Text>
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
