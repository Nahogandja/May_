
import { router, useLocalSearchParams } from "expo-router";
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
  const params = useLocalSearchParams<{
    driverId?: string;
    driverName?: string;
    vehicleDetails?: string;
  }>();

  const driverId = Array.isArray(params.driverId)
    ? params.driverId[0]
    : params.driverId;

  const driverName = Array.isArray(params.driverName)
    ? params.driverName[0]
    : params.driverName;

  const vehicleDetails = Array.isArray(params.vehicleDetails)
    ? params.vehicleDetails[0]
    : params.vehicleDetails;

  const {
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();

  const [submitting, setSubmitting] = useState(false);
  const [safeArrivalCode, setSafeArrivalCode] =
    useState<string | null>(null);
  const [driverAssigned, setDriverAssigned] = useState(false);

  const [enteredCode, setEnteredCode] = useState("");
  const [rideId, setRideId] =
    useState<string | number | null>(null);
  const [confirmingArrival, setConfirmingArrival] =
    useState(false);
  const [arrivalConfirmed, setArrivalConfirmed] =
    useState(false);

  const handleConfirmRide = async () => {
    if (!driverId) {
      Alert.alert(
        "Missing taxi",
        "Please return and select an available May taxi."
      );
      return;
    }

    if (!userAddress || !destinationAddress) {
      Alert.alert(
        "Missing information",
        "Pickup and dropoff locations are required."
      );
      return;
    }

    if (
      typeof userLatitude !== "number" ||
      typeof userLongitude !== "number" ||
      typeof destinationLatitude !== "number" ||
      typeof destinationLongitude !== "number"
    ) {
      Alert.alert(
        "Missing information",
        "Valid pickup and destination coordinates are required."
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
          driverId,
          bookingMode: "Solo",
          pricingCategory: "Standard",
        }),
      });

      if (!data?.ride?.id || !data?.ride?.safe_arrival_code) {
        throw new Error(
          data?.message ||
            "The booking response is missing ride details."
        );
      }

      setSafeArrivalCode(data.ride.safe_arrival_code);
      setDriverAssigned(Boolean(data.driverAssigned));
      setRideId(data.ride.id);

      Alert.alert(
        "Booking Successful",
        "Your May taxi has been reserved successfully."
      );
    } catch (err: any) {
      Alert.alert(
        "Booking Error",
        err?.message || "Booking failed. Please try again."
      );
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
      Alert.alert(
        "Missing code",
        "Please enter your Safe Arrival Code."
      );
      return;
    }

    setConfirmingArrival(true);

    try {
      const result = await fetchAPI(
        `/api/rides/safe-arrival/${rideId}`,
        {
          method: "POST",
          body: JSON.stringify({
            code: enteredCode.trim().toUpperCase(),
          }),
        }
      );

      if (result?.message !== "Safe arrival confirmed") {
        throw new Error(
          result?.message ||
            "The Safe Arrival Code could not be verified."
        );
      }

      setArrivalConfirmed(true);

      Alert.alert(
        "Safe Arrival Confirmed",
        "Your ride has been completed successfully."
      );
    } catch (err: any) {
      Alert.alert(
        "Unable to Confirm",
        err?.message ||
          "The driver must first mark the destination as reached."
      );
    } finally {
      setConfirmingArrival(false);
    }
  };

  return (
    <RideLayout title="Book Ride">
      <View className="w-full mt-5">
        <Text className="text-xl font-JakartaBold mb-4">
          Confirm Your May Ride
        </Text>

        <View className="flex-row items-center border-b border-gray-200 py-3">
          <Image source={icons.to} className="w-6 h-6" />
          <Text className="text-base ml-3 flex-1">
            {userAddress}
          </Text>
        </View>

        <View className="flex-row items-center border-b border-gray-200 py-3">
          <Image source={icons.point} className="w-6 h-6" />
          <Text className="text-base ml-3 flex-1">
            {destinationAddress}
          </Text>
        </View>

        <View className="mt-5 p-4 bg-gray-100 rounded-xl">
          <Text className="text-lg font-JakartaBold">
            {driverName || "Selected May Driver"}
          </Text>

          <Text className="text-gray-500 mt-1">
            {vehicleDetails || "Standard May Taxi"}
          </Text>

          <Text className="mt-3 font-JakartaSemiBold">
            Booking Mode: Solo
          </Text>

          <Text className="mt-1 font-JakartaSemiBold">
            Vehicle Category: Standard
          </Text>

          <Text className="text-xl font-JakartaBold mt-3">
            Total Fare: N$30.00
          </Text>
        </View>
      </View>

      {!safeArrivalCode ? (
        <CustomButton
          title={
            submitting ? "Booking..." : "Confirm Booking"
          }
          onPress={handleConfirmRide}
          disabled={submitting || !driverId}
          className="mt-8"
        />
      ) : (
        <View className="w-full items-center mt-8">
          <Text className="text-lg font-JakartaSemiBold text-center">
            {driverAssigned
              ? "Ride booked, driver assigned"
              : "Ride booked, awaiting driver"}
          </Text>

          {!arrivalConfirmed ? (
            <>
              <Text className="mt-5 text-gray-500">
                Your Safe Arrival Code
              </Text>

              <Text className="text-3xl font-JakartaBold mt-2">
                {safeArrivalCode}
              </Text>

              <Text className="text-center text-gray-500 mt-5">
                Enter this code only after your driver has
                marked your destination as reached.
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

              <CustomButton
                title="View My Rides"
                onPress={() =>
                  router.replace("/(root)/(tabs)/rides")
                }
                className="mt-4"
              />
            </>
          ) : (
            <>
              <Text className="text-lg font-JakartaBold mt-8">
                Safe Arrival Confirmed
              </Text>

              <Text className="text-center text-gray-500 mt-2">
                Your ride has been completed successfully.
              </Text>

              <CustomButton
                title="Back to Home"
                onPress={() =>
                  router.replace("/(root)/(tabs)/home")
                }
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
