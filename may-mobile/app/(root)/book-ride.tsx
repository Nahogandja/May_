import { router } from "expo-router";
import { useState } from "react";
import { Alert, Image, Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { fetchAPI } from "@/lib/fetch";
import { useLocationStore } from "@/store";

const BookRide = () => {
  const {
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();
  const [submitting, setSubmitting] = useState(false);
  const [safeArrivalCode, setSafeArrivalCode] = useState<string | null>(null);
  const [driverAssigned, setDriverAssigned] = useState(false);

  const handleConfirmRide = async () => {
    if (!userAddress || !destinationAddress) {
      Alert.alert("Missing information", "Pickup and dropoff locations are required.");
      return;
    }
    if (typeof userLatitude !== "number" || typeof userLongitude !== "number") {
      Alert.alert("Missing information", "Your current location could not be determined.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await fetchAPI("/api/rides/book", {
        method: "POST",
        body: JSON.stringify({
          pickup: userAddress,
          dropoff: destinationAddress,
          pickupLat: userLatitude,
          pickupLng: userLongitude,
          dropoffLat: destinationLatitude,
          dropoffLng: destinationLongitude,
        }),
      });

      setSafeArrivalCode(data.ride.safe_arrival_code);
      setDriverAssigned(data.driverAssigned);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RideLayout title="Book Ride">
      <View className="flex flex-col w-full items-start justify-center mt-5">
        <View className="flex flex-row items-center justify-start mt-3 border-t border-b border-general-700 w-full py-3">
          <Image source={icons.to} className="w-6 h-6" />
          <Text className="text-lg font-JakartaRegular ml-2">{userAddress}</Text>
        </View>

        <View className="flex flex-row items-center justify-start border-b border-general-700 w-full py-3">
          <Image source={icons.point} className="w-6 h-6" />
          <Text className="text-lg font-JakartaRegular ml-2">{destinationAddress}</Text>
        </View>
      </View>

      {safeArrivalCode ? (
        <View className="flex flex-col w-full items-center justify-center mt-10">
          <Text className="text-lg font-JakartaSemiBold">
            {driverAssigned ? "Ride booked, driver assigned" : "Ride booked, searching for a driver"}
          </Text>
          <Text className="text-md font-JakartaRegular mt-2">
            Safe Arrival Code
          </Text>
          <Text className="text-3xl font-JakartaBold mt-1">{safeArrivalCode}</Text>
          <CustomButton
            title="Back to Home"
            onPress={() => router.replace("/(root)/(tabs)/home")}
            className="mt-10"
          />
        </View>
      ) : (
        <CustomButton
          title={submitting ? "Booking..." : "Confirm Ride"}
          onPress={handleConfirmRide}
          className="mt-10"
        />
      )}
    </RideLayout>
  );
};

export default BookRide;