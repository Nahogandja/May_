import { router } from "expo-router";
import { Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import LocationTextInput from "@/components/LocationTextInput";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { useLocationStore } from "@/store";

const FindRide = () => {
  const {
    userAddress,
    destinationAddress,
    setDestinationLocation,
    setUserLocation,
  } = useLocationStore();

  const handleFindRide = () => {
    if (!userAddress) {
      return;
    }

    if (!destinationAddress) {
      return;
    }

    router.push("/(root)/confirm-ride");
  };

  return (
    <RideLayout title="Ride">
      <View className="my-3">
        <Text className="text-lg font-JakartaSemiBold mb-3">
          From
        </Text>

        <LocationTextInput
          icon={icons.target}
          initialLocation={userAddress || "Current Location"}
          containerStyle="bg-neutral-100"
          textInputBackgroundColor="#f5f5f5"
          handlePress={(location) =>
            setUserLocation(location)
          }
        />
      </View>

      <View className="my-3">
        <Text className="text-lg font-JakartaSemiBold mb-3">
          To
        </Text>

        <LocationTextInput
          icon={icons.map}
          initialLocation={
            destinationAddress || "Search destination"
          }
          containerStyle="bg-neutral-100"
          textInputBackgroundColor="transparent"
          handlePress={(location) =>
            setDestinationLocation(location)
          }
        />
      </View>

      <CustomButton
        title="Find Now"
        onPress={handleFindRide}
        className="mt-5"
      />
    </RideLayout>
  );
};

export default FindRide;