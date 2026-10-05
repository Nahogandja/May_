import * as Location from "expo-location";
import { router } from "expo-router";
import { useState, useEffect } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import LocationTextInput from "@/components/LocationTextInput";
import Map from "@/components/Map";
import RideCard from "@/components/RideCard";
import { icons, images } from "@/constants";
import { useFetch } from "@/lib/fetch";
import { useLocationStore } from "@/store";
import { useAuthStore } from "@/store/auth";
import { Ride } from "@/types/type";

const Home = () => {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const { setUserLocation, setDestinationLocation } = useLocationStore();

  const handleSignOut = () => {
    clearAuth();
    router.replace("/(auth)/sign-in");
  };

  const [locationLoading, setLocationLoading] = useState(true);

  const { data: recentRides, loading } = useFetch<Ride[]>("/api/rides/my-rides");

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          // Fallback to Windhoek so the map still shows
          setUserLocation({
            latitude: -22.5609,
            longitude: 17.0658,
            address: "Windhoek, Namibia",
          });
          Alert.alert(
            "Location Permission",
            "Location access was denied. Showing Windhoek as default."
          );
          setLocationLoading(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        let address = "Current Location";
        try {
          const places = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          if (places[0]) {
            address = `${places[0].name || places[0].street || ""}, ${places[0].city || places[0].region || ""}`.trim();
          }
        } catch (geoErr) {
          console.warn("Reverse geocode failed:", geoErr);
        }

        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address,
        });
      } catch (err) {
        console.error("Location error:", err);
        // Still show a map with Windhoek fallback
        setUserLocation({
          latitude: -22.5609,
          longitude: 17.0658,
          address: "Windhoek, Namibia",
        });
      } finally {
        setLocationLoading(false);
      }
    })();
  }, []);

  const handleDestinationPress = (location: {
    latitude: number;
    longitude: number;
    address: string;
  }) => {
    setDestinationLocation(location);
    router.push("/(root)/find-ride");
  };

  return (
    <SafeAreaView className="bg-general-500 flex-1">
      <FlatList
        data={recentRides?.slice(0, 5) ?? []}
        renderItem={({ item }) => <RideCard ride={item} />}
        keyExtractor={(item, index) => item.id?.toString() ?? index.toString()}
        className="px-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={() => (
          <View className="flex flex-col items-center justify-center py-10">
            {!loading ? (
              <>
                <Image
                  source={images.noResult}
                  className="w-40 h-40"
                  resizeMode="contain"
                />
                <Text className="text-sm">No recent rides found</Text>
              </>
            ) : (
              <ActivityIndicator size="small" color="#000" />
            )}
          </View>
        )}
        ListHeaderComponent={
          <>
            <View className="flex flex-row items-center justify-between my-5">
              <Text className="text-2xl font-JakartaExtraBold">
                Welcome {user?.name ?? "Passenger"}
              </Text>
              <TouchableOpacity
                onPress={handleSignOut}
                className="justify-center items-center w-10 h-10 rounded-full bg-white"
              >
                <Image source={icons.out} className="w-4 h-4" />
              </TouchableOpacity>
            </View>

            <LocationTextInput
              icon={icons.search}
              containerStyle="bg-white shadow-md shadow-neutral-300"
              handlePress={handleDestinationPress}
            />

            <Text className="text-xl font-JakartaBold mt-5 mb-3">
              Your current location
            </Text>

            <View
              style={{ height: 300, width: "100%", borderRadius: 16, overflow: "hidden" }}
              className="bg-transparent"
            >
              {locationLoading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" color="#0286FF" />
                  <Text className="mt-2 text-sm text-gray-500">Getting location...</Text>
                </View>
              ) : (
                <Map />
              )}
            </View>

            <Text className="text-xl font-JakartaBold mt-5 mb-3">
              Recent Rides
            </Text>
          </>
        }
      />
    </SafeAreaView>
  );
};

export default Home;