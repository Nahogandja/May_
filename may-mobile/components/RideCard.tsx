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
  const isPending = status.toLowerCase() === "pending";

  const handleConfirmArrival = async () => {
    if (!enteredCode.trim()) {
      Alert.alert("Missing code", "Please enter your Safe Arrival Code.");
      return;
    }

    setSubmitting(true);

    try {
      await fetchAPI(`/api/rides/safe-arrival/${ride.id}`, {
        method: "POST",
        body: JSON.stringify({
          code: enteredCode.trim().toUpperCase(),
        }),
      });

      if (onVerified) {
  await onVerified();
}

      Alert.alert(
        "Safe Arrival Confirmed",
        "Your ride is completed and the driver has been released for another ride."
      );

      setEnteredCode("");
    } catch (error) {
      Alert.alert(
        "Unable to Confirm",
        error instanceof Error
          ? error.message
          : "The Safe Arrival Code could not be verified."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor =
    status.toLowerCase() === "completed"
      ? "text-green-700"
      : status.toLowerCase() === "cancelled"
        ? "text-red-700"
        : "text-orange-600";

  return (
    <View className="mb-3 rounded-lg bg-white shadow-sm shadow-neutral-300">
      <View className="w-full p-3">
        <View className="w-full gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <Image source={icons.to} className="h-5 w-5" />
            <Text
              className="flex-1 text-md font-JakartaMedium"
              numberOfLines={2}
            >
              {ride.pickup || "Pickup location unavailable"}
            </Text>
          </View>

          <View className="flex-row items-center gap-x-2">
            <Image source={icons.point} className="h-5 w-5" />
            <Text
              className="flex-1 text-md font-JakartaMedium"
              numberOfLines={2}
            >
              {ride.dropoff || "Destination unavailable"}
            </Text>
          </View>
        </View>

        <View className="mt-4 w-full rounded-lg bg-general-500 p-3">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">
              Date
            </Text>
            <Text className="ml-3 flex-1 text-right text-md font-JakartaBold">
              {formatDate(ride.created_at)}
            </Text>
          </View>

          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">
              Driver
            </Text>
            <Text className="ml-3 flex-1 text-right text-md font-JakartaBold">
              {ride.driver_name || "Awaiting driver"}
            </Text>
          </View>

          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">
              Status
            </Text>
            <Text className={`font-JakartaBold capitalize ${statusColor}`}>
              {status.replace(/_/g, " ")}
            </Text>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-md font-JakartaMedium text-gray-500">
              Safe Arrival Code
            </Text>
            <Text className="ml-3 font-JakartaBold">
              {ride.safe_arrival_code || "Not available"}
            </Text>
          </View>
        </View>

        {isPending && (
          <View className="mt-4">
            <Text className="mb-2 font-JakartaSemiBold">
              Confirm your safe arrival
            </Text>

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
              className={`min-h-12 items-center justify-center rounded-lg px-4 py-3 ${
                submitting || !enteredCode.trim()
                  ? "bg-gray-400"
                  : "bg-primary-500"
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="font-JakartaBold text-white">
                  Confirm Safe Arrival
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};

export default RideCard;