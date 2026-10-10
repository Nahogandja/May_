import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  Text,
  TextInput,
  View,
} from "react-native";

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

  const [enteredCode, setEnteredCode] = useState("");
  const [rideId, setRideId] = useState<string | number | null>(null);
  const [confirmingArrival, setConfirmingArrival] = useState(false);
  const [arrivalConfirmed, setArrivalConfirmed] = useState(false);

  const handleConfirmRide = async () => {
    if (!userAddress || !destinationAddress) {
      Alert.alert(
        "Missing information",
        "Pickup and dropoff locations are required."
      );
      return;
    }

    if (
      typeof userLatitude !== "number" ||
      typeof userLongitude !== "number"
    ) {
      Alert.alert(
        "Missing information",
        "Your current location could not be determined."
      );
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

      if (!data.ride?.id || !data.ride?.safe_arrival_code) {
        throw new Error("The booking response is missing ride details.");
      }

      setSafeArrivalCode(data.ride.safe_arrival_code);
      setDriverAssigned(data.driverAssigned);
      setRideId(data.ride.id);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSafeArrival = async () => {
    if (rideId === null) {
      Alert.alert("Error", "Ride information is missing.");
      return;
    }

    if (!enteredCode.trim()) {
      Alert.alert("Missing code", "Please enter the Safe Arrival Code.");
      return;
    }

    setConfirmingArrival(true);

    try {
      await fetchAPI(`/api/rides/safe-arrival/${rideId}`, {
        method: "POST",
        body: JSON.stringify({
          code: enteredCode.trim(),
        }),
      });

      setArrivalConfirmed(true);

      Alert.alert(
        "Safe Arrival Confirmed",
        "Your ride has been marked as completed."
      );
    } catch (err: any) {
      Alert.alert(
        "Unable to Confirm",
        err.message || "The Safe Arrival Code could not be verified."
      );
    } finally {
      setConfirmingArrival(false);
    }
  };

  return (
    <RideLayout title="Book Ride">
      <View className="flex flex-col w-full items-start justify-center mt-5">
        <View className="flex flex-row items-center justify-start mt-3 border-t border-b border-general-700 w-full py-3">
          <Image source={icons.to} className="w-6 h-6" />
          <Text
            className="text-lg font-JakartaRegular ml-2 flex-1"
            numberOfLines={2}
          >
            {userAddress}
          </Text>
        </View>

        <View className="flex flex-row items-center justify-start border-b border-general-700 w-full py-3">
          <Image source={icons.point} className="w-6 h-6" />
          <Text
            className="text-lg font-JakartaRegular ml-2 flex-1"
            numberOfLines={2}
          >
            {destinationAddress}
          </Text>
        </View>
      </View>

      {!safeArrivalCode ? (
        <CustomButton
          title={submitting ? "Booking..." : "Confirm Ride"}
          onPress={handleConfirmRide}
          className="mt-10"
          disabled={submitting}
        />
      ) : (
        <View className="flex flex-col w-full items-center justify-center mt-8">
          <Text className="text-lg font-JakartaSemiBold text-center">
            {driverAssigned
              ? "Ride booked, driver assigned"
              : "Ride booked, searching for a driver"}
          </Text>

          {!arrivalConfirmed ? (
            <>
              <Text className="text-md font-JakartaRegular mt-5">
                Safe Arrival Code
              </Text>

              <Text className="text-3xl font-JakartaBold mt-1">
                {safeArrivalCode}
              </Text>

              <Text className="text-md font-JakartaRegular mt-8 text-center">
                Enter the Safe Arrival Code when you have arrived safely.
              </Text>

              <TextInput
                value={enteredCode}
                onChangeText={setEnteredCode}
                placeholder="Enter Safe Arrival Code"
                autoCapitalize="characters"
                autoCorrect={false}
                className="border border-gray-300 rounded-lg w-full mt-4 px-4 py-3 text-lg text-center"
              />

              <CustomButton
                title={
                  confirmingArrival
                    ? "Confirming..."
                    : "Confirm Safe Arrival"
                }
                onPress={handleSubmitSafeArrival}
                className="mt-5"
                disabled={confirmingArrival}
              />
            </>
          ) : (
            <>
              <Text className="text-lg font-JakartaSemiBold mt-8 text-center">
                Safe Arrival Confirmed
              </Text>

              <Text className="text-md font-JakartaRegular mt-2 text-center">
                Your ride has been completed successfully.
              </Text>

              <CustomButton
                title="Back to Home"
                onPress={() => router.replace("/(root)/(tabs)/home")}
                className="mt-8"
              />
            </>
          )}
        </View>
      )}
    </RideLayout>
  );
};

export default BookRide;
