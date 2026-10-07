import * as Location from "expo-location";
import { router } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import LocationTextInput from "@/components/LocationTextInput";
import Map from "@/components/Map";
import RideCard from "@/components/RideCard";
import { icons, images } from "@/constants";
import { fetchAPI, useFetch } from "@/lib/fetch";
import { useLocationStore } from "@/store";
import { useAuthStore } from "@/store/auth";
import { Ride } from "@/types/type";

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

const Home = () => {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const {
    userLatitude,
    userLongitude,
    setUserLocation,
    setDestinationLocation,
  } = useLocationStore();

  const [locationLoading, setLocationLoading] = useState(true);
  const [driversLoading, setDriversLoading] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: recentRides,
    loading,
    refetch: refetchRides,
  } = useFetch<Ride[]>("/api/rides/my-rides");

  const handleSignOut = () => {
    clearAuth();
    router.replace("/(auth)/sign-in");
  };

  /**
   * Get the passenger's current location.
   */
  useEffect(() => {
    let mounted = true;

    const getLocation = async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          if (!mounted) return;

          setUserLocation({
            latitude: -22.5609,
            longitude: 17.0658,
            address: "Windhoek, Namibia",
          });

          Alert.alert(
            "Location Permission",
            "Location access was denied. Showing Windhoek as your default location."
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
            const place = places[0];

            address =
              `${place.name || place.street || ""}, ${
                place.city || place.region || ""
              }`
                .replace(/^,\s*/, "")
                .replace(/,\s*$/, "")
                .trim() || "Current Location";
          }
        } catch (geoError) {
          console.warn("Reverse geocode failed:", geoError);
        }

        if (!mounted) return;

        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address,
        });
      } catch (error) {
        console.error("Location error:", error);

        if (!mounted) return;

        setUserLocation({
          latitude: -22.5609,
          longitude: 17.0658,
          address: "Windhoek, Namibia",
        });
      } finally {
        if (mounted) {
          setLocationLoading(false);
        }
      }
    };

    getLocation();

    return () => {
      mounted = false;
    };
  }, [setUserLocation]);

  /**
   * Get nearby available May drivers.
   *
   * The backend has already been tested successfully with:
   *
   * /api/rides/nearby-drivers
   *
   * fetchAPI automatically adds the passenger's JWT.
   */
  const loadNearbyDrivers = useCallback(async () => {
    if (userLatitude === null || userLongitude === null) {
      return;
    }

    try {
      setDriversLoading(true);

      const drivers = await fetchAPI(
        `/api/rides/nearby-drivers?lat=${userLatitude}&lng=${userLongitude}&radius=10&limit=20`
      );

      if (Array.isArray(drivers)) {
        setNearbyDrivers(drivers);
      } else if (Array.isArray(drivers?.data)) {
        setNearbyDrivers(drivers.data);
      } else {
        setNearbyDrivers([]);
      }
    } catch (error) {
      console.error("Nearby drivers error:", error);
      setNearbyDrivers([]);
    } finally {
      setDriversLoading(false);
    }
  }, [userLatitude, userLongitude]);

  /**
   * Load nearby drivers whenever the passenger's
   * location becomes available or changes.
   */
  useEffect(() => {
    loadNearbyDrivers();
  }, [loadNearbyDrivers]);

  const handleDestinationPress = (location: {
    latitude: number;
    longitude: number;
    address: string;
  }) => {
    setDestinationLocation(location);
    router.push("/(root)/find-ride");
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        loadNearbyDrivers(),
        refetchRides(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const taxiCount = nearbyDrivers.length;

  return (
    <SafeAreaView className="bg-general-500 flex-1">
      <FlatList
        data={recentRides?.slice(0, 5) ?? []}
        renderItem={({ item }) => <RideCard ride={item} />}
        keyExtractor={(item, index) =>
          item.id?.toString() ?? index.toString()
        }
        className="px-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
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
              style={{
                height: 300,
                width: "100%",
                borderRadius: 16,
                overflow: "hidden",
              }}
              className="bg-transparent"
            >
              {locationLoading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator
                    size="large"
                    color="#0286FF"
                  />
                  <Text className="mt-2 text-sm text-gray-500">
                    Getting location...
                  </Text>
                </View>
              ) : (
                <Map />
              )}
            </View>

            {/* AVAILABLE TAXIS */}
            <View className="mt-5 bg-white rounded-2xl p-4 shadow-sm">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Text className="text-2xl mr-2">🚕</Text>

                  <View>
                    <Text className="text-lg font-JakartaBold">
                      May taxis nearby
                    </Text>

                    {driversLoading ? (
                      <Text className="text-sm text-gray-500 mt-1">
                        Checking availability...
                      </Text>
                    ) : (
                      <Text className="text-sm text-gray-500 mt-1">
                        {taxiCount === 0
                          ? "No taxis currently available"
                          : `${taxiCount} ${
                              taxiCount === 1 ? "taxi" : "taxis"
                            } available`}
                      </Text>
                    )}
                  </View>
                </View>

                {driversLoading ? (
                  <ActivityIndicator
                    size="small"
                    color="#0286FF"
                  />
                ) : (
                  <View className="bg-general-500 rounded-full px-3 py-2">
                    <Text className="font-JakartaBold">
                      {taxiCount}
                    </Text>
                  </View>
                )}
              </View>

              {taxiCount > 0 && (
                <TouchableOpacity
                  onPress={() =>
                    router.push("/(root)/find-ride")
                  }
                  className="mt-4 bg-general-600 rounded-xl py-3 items-center"
                >
                  <Text className="font-JakartaBold text-white">
                    Book a May taxi
                  </Text>
                </TouchableOpacity>
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