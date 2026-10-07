import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import DriverCard from "@/components/DriverCard";
import RideLayout from "@/components/RideLayout";
import { useDriverStore } from "@/store";

const ConfirmRide = () => {
  const { drivers, selectedDriver, setSelectedDriver } = useDriverStore();

  const handleContinue = () => {
    if (!selectedDriver) {
      return;
    }

    router.push("/(root)/book-ride");
  };

  return (
    <RideLayout title="Choose a May Taxi" snapPoints={["65%", "85%"]}>
      <FlatList
        data={drivers}
        keyExtractor={(item, index) =>
          item.id?.toString() ?? index.toString()
        }
        renderItem={({ item }) => {
          /*
           * The driver store currently contains the old MarkerData
           * structure. Convert it into the structure expected by
           * the new May DriverCard.
           */
          const driver = {
            id: item.id,
            name: item.title ?? "May Driver",
            phone: "",
            vehicleDetails: item.car_image_url ?? null,
            latitude: item.latitude ?? 0,
            longitude: item.longitude ?? 0,
            distanceKm: 0,
            lastLocationUpdate: null,
          };

          return (
            <DriverCard
              item={driver}
              selected={selectedDriver}
              setSelected={() => setSelectedDriver(item.id!)}
            />
          );
        }}
        ListEmptyComponent={() => (
          <View className="items-center justify-center py-10 px-5">
            <Text className="text-lg font-JakartaBold text-center">
              No May taxis available
            </Text>

            <Text className="text-sm text-gray-500 text-center mt-2">
              There are currently no available taxis near your location.
              Please try again shortly.
            </Text>
          </View>
        )}
        ListFooterComponent={() => (
          <View className="mx-5 mt-10 mb-5">
            <CustomButton
              title="Continue"
              onPress={handleContinue}
              disabled={!selectedDriver}
            />
          </View>
        )}
      />
    </RideLayout>
  );
};

export default ConfirmRide;