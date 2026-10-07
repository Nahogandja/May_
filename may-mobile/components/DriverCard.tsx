import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

type NearbyDriver = {
  id: string;
  name: string;
  phone: string;
  vehicleDetails: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  lastLocationUpdate: string | null;
};

type DriverCardProps = {
  item: NearbyDriver;
  selected?: string | null;
  setSelected: () => void;
};

const DriverCard = ({
  item,
  selected,
  setSelected,
}: DriverCardProps) => {
  const isSelected = selected === item.id;

  const distance =
    typeof item.distanceKm === "number"
      ? item.distanceKm.toFixed(1)
      : "—";

  return (
    <TouchableOpacity
      onPress={setSelected}
      activeOpacity={0.8}
      className={`${
        isSelected ? "bg-general-600" : "bg-white"
      } flex-row items-center justify-between py-4 px-4 rounded-xl mb-3`}
    >
      {/* Taxi icon */}
      <View
        className={`w-14 h-14 rounded-full items-center justify-center ${
          isSelected ? "bg-white" : "bg-general-500"
        }`}
      >
        <Text className="text-2xl">🚕</Text>
      </View>

      {/* Driver information */}
      <View className="flex-1 mx-4">
        <Text
          className={`text-lg font-JakartaBold ${
            isSelected ? "text-white" : "text-black"
          }`}
        >
          {item.name}
        </Text>

        <Text
          className={`text-sm font-JakartaRegular mt-1 ${
            isSelected
              ? "text-white"
              : "text-general-800"
          }`}
        >
          {distance} km away
        </Text>

        <Text
          className={`text-sm font-JakartaRegular mt-1 ${
            isSelected
              ? "text-white"
              : "text-gray-500"
          }`}
        >
          Available
        </Text>

        {item.vehicleDetails && (
          <Text
            className={`text-sm font-JakartaRegular mt-1 ${
              isSelected
                ? "text-white"
                : "text-gray-500"
            }`}
          >
            {item.vehicleDetails}
          </Text>
        )}
      </View>

      {/* Selection indicator */}
      <View
        className={`w-7 h-7 rounded-full border-2 items-center justify-center ${
          isSelected
            ? "border-white"
            : "border-general-800"
        }`}
      >
        {isSelected && (
          <View className="w-3 h-3 rounded-full bg-white" />
        )}
      </View>
    </TouchableOpacity>
  );
};

export default DriverCard;