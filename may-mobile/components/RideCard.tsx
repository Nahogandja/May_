import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { icons } from "@/constants";
import { formatDate } from "@/lib/utils";
import { fetchAPI } from "@/lib/fetch";
import { Ride } from "@/types/type";

type RideCardProps = {
  ride: Ride;
  onVerified?: () => Promise<void>;
};

const RideCard = ({ ride, onVerified }: RideCardProps) => {
  const [enteredCode, setEnteredCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const status = ride.status || "Pending";
  const readyForSafeArrival = status.toLowerCase() === "active" && ride.driver_finished === true;
  const awaitingDriver = status.toLowerCase() === "pending" || (status.toLowerCase() === "active" && !ride.driver_finished);

  const handleConfirmArrival = async () => {
    if (!enteredCode.trim()) {
      Alert.alert("Missing code", "Please enter your Safe Arrival Code.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetchAPI(`/api/rides/safe-arrival/${ride.id}`, {
        method: "POST",
        body: JSON.stringify({ code: enteredCode.trim().toUpperCase() }),
      });
      if (onVerified) await onVerified();
      Alert.alert(
        "Safe Arrival Confirmed",
        result?.driverAvailable
          ? "Your ride is completed. The taxi is available for another booking."
          : "Your ride is completed. The taxi stays reserved until all other passengers finish."
      );
      setEnteredCode("");
    } catch (error) {
      Alert.alert("Unable to Confirm", error instanceof Error ? error.message : "The Safe Arrival Code could not be verified.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRide = () => {
    if (submitting) return;
    Alert.alert("Cancel this booking?", "You can cancel before the driver starts the ride.", [
      { text: "Keep booking", style: "cancel" },
      {
        text: "Cancel ride",
        style: "destructive",
        onPress: async () => {
          setSubmitting(true);
          try {
            await fetchAPI(`/api/rides/cancel/${ride.id}`, { method: "PATCH" });
            if (onVerified) await onVerified();
            Alert.alert("Booking cancelled", "Your taxi reservation has been released.");
          } catch (err) {
            Alert.alert("Cancellation failed", err instanceof Error ? err.message : "Please try again.");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const statusColor =
    status.toLowerCase() === "completed" ? "text-green-700" :
    status.toLowerCase() === "cancelled" ? "text-red-700" : "text-orange-600";

  return (
    <View className="mb-3 rounded-lg bg-white shadow-sm shadow-neutral-300">
      <View className="w-full p-3">
        <View className="w-full gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <Image source={icons.to} className="h-5 w-5" />
            <Text className="flex-1 text-md font-JakartaMedium" numberOfLines={2}>{ride.pickup || "Pickup location unavailable"}</Text>
          </View>
          <View className="flex-row items-center gap-x-2">
            <Image source={icons.point} className="h-5 w-5" />
            <Text className="flex-1 text-md font-JakartaMedium" numberOfLines={2}>{ride.dropoff || "Destination unavailable"}</Text>
          </View>
        </View>

        <View className="mt-4 w-full rounded-lg bg-general-500 p-3">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Date</Text>
            <Text className="ml-3 flex-1 text-right text-md font-JakartaBold">{formatDate(ride.created_at)}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Driver</Text>
            <Text className="ml-3 flex-1 text-right text-md font-JakartaBold">{ride.driver_name || "Awaiting driver"}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Status</Text>
            <Text className={`font-JakartaBold capitalize ${statusColor}`}>{status.replace(/_/g, " ")}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Booking</Text>
            <Text className="font-JakartaBold">{(ride as Ride & { booking_mode?: string }).booking_mode || "Sharing"}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Fare</Text>
            <Text className="font-JakartaBold">
              {ride.fare != null ? `N$${Number(ride.fare).toFixed(2)}` : "Not recorded"}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-md font-JakartaMedium text-gray-500">Safe Arrival Code</Text>
            <Text className="ml-3 font-JakartaBold">{ride.safe_arrival_code || "Not available"}</Text>
          </View>
        </View>

        {awaitingDriver && (
          <View className="mt-4 rounded-lg bg-amber-50 p-3">
            <Text className="font-JakartaSemiBold text-amber-800">Ride in progress</Text>
            <Text className="mt-1 text-sm leading-5 text-amber-800">When your driver reaches the destination and marks arrival, enter your Safe Arrival Code here.</Text>
          </View>
        )}

        {status.toLowerCase() === "pending" && (
          <Pressable
            onPress={handleCancelRide}
            disabled={submitting}
            className="mt-3 items-center rounded-lg border border-red-300 bg-red-50 p-3"
          >
            <Text className="font-JakartaBold text-red-700">
              {submitting ? "Cancelling..." : "Cancel pending booking"}
            </Text>
          </Pressable>
        )}

        {readyForSafeArrival && (
          <View className="mt-4">
            <Text className="mb-2 font-JakartaSemiBold">Confirm your safe arrival</Text>
            <Text className="mb-3 text-sm leading-5 text-gray-600">Enter the code only after you have safely exited the vehicle. For shared rides, the driver is released only after every passenger confirms.</Text>
            <TextInput
              value={enteredCode}
              onChangeText={(text) => setEnteredCode(text.toUpperCase())}
              placeholder="Enter your 6-character code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              editable={!submitting}
              className="mb-3 rounded-lg border border-gray-300 px-4 py-3 font-JakartaMedium"
            />
            <Pressable
              onPress={handleConfirmArrival}
              disabled={submitting || !enteredCode.trim()}
              className={`min-h-12 items-center justify-center rounded-lg px-4 py-3 ${submitting || !enteredCode.trim() ? "bg-gray-400" : "bg-primary-500"}`}
            >
              {submitting ? <ActivityIndicator color="#ffffff" /> : <Text className="font-JakartaBold text-white">Confirm Safe Arrival</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};

export default RideCard;
