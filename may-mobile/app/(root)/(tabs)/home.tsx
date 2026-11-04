
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
import { useUpcomingRideReminder } from "@/hooks/useUpcomingRideReminder";
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
  useUpcomingRideReminder(user?.role === "Passenger" ? "Passenger" : undefined);

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
    router.replace("/(auth)/welcome");
  };

  // Get the passenger's current location.
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

  // Load nearby available drivers.
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

  // Keep the passenger's displayed code current when the backend rotates it
  // five minutes after arrival. Existing route/tab behavior is unchanged.
  useEffect(() => {
    const timer = setInterval(() => { void refetchRides(); }, 15_000);
    return () => clearInterval(timer);
  }, [refetchRides]);

  const taxiCount = nearbyDrivers.length;

  const activeRides = (recentRides ?? [])
    .filter((ride) => {
      const status = (ride.status || "Pending").toLowerCase();
      return status === "pending" || status === "active";
    })
    .slice(0, 5);

  return (
    <SafeAreaView className="bg-may-page flex-1">
      <FlatList
        data={activeRides}
        renderItem={({ item }) => <RideCard ride={item} onVerified={refetchRides} />}
        keyExtractor={(item, index) =>
          item.id?.toString() ?? index.toString()
        }
        className="px-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 128 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        ListEmptyComponent={() => (
          <View className="flex flex-col items-center justify-center py-5">
            {!loading ? (
              <>
                <Image
                  source={images.noResult}
                  className="w-40 h-40"
                  resizeMode="contain"
                />
                <Text className="text-sm">
                  No active rides right now
                </Text>
              </>
            ) : (
              <ActivityIndicator size="small" color="#5969C7" />
            )}
          </View>
        )}
        ListHeaderComponent={
          <>
            {/* Welcome and sign-out */}
            <View className="flex flex-row items-center justify-between my-5">
              <Text className="flex-1 pr-3 text-2xl text-may-navy font-JakartaExtraBold">
                Hello, {user?.name ?? "Passenger"}
              </Text>

              <TouchableOpacity
                onPress={handleSignOut}
                className="justify-center items-center w-11 h-11 rounded-2xl border border-may-lavender bg-white"
              >
                <Image
                  source={icons.out}
                  className="w-4 h-4"
                />
              </TouchableOpacity>
            </View>

            {/* Destination search */}
            <LocationTextInput
              icon={icons.search}
              containerStyle="bg-white shadow-md shadow-neutral-300"
              handlePress={handleDestinationPress}
            />

            {/* Safety actions moved from the welcome page. Each opens the active ride's
                controls, where arrival confirmation, SOS and sharing are available. */}
            <View style={{ marginTop: 18, flexDirection: 'row', gap: 9 }}>
              {[
                { glyph: '✓', title: 'Safe Arrival', detail: 'Verify trip' },
                { glyph: '!', title: 'SOS Alert', detail: 'Get help' },
                { glyph: '↗', title: 'Live Sharing', detail: 'Share trip' },
              ].map(action => <TouchableOpacity key={action.title}
                accessibilityRole="button" accessibilityLabel={action.title}
                onPress={() => {
                  if (!activeRides.length) {
                    Alert.alert('No active ride', 'Book a ride to use trip-specific safety tools.');
                  } else {
                    router.push('/(root)/(tabs)/rides');
                  }
                }}
                style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 15,
                  paddingVertical: 13, paddingHorizontal: 4, alignItems: 'center',
                  borderWidth: 1, borderColor: '#DFE3F3' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18,
                    backgroundColor: '#EDF0FF', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#303A7C', fontWeight: '900', fontSize: 22 }}>{action.glyph}</Text>
                  </View>
                  <Text style={{ color: '#303A7C', fontSize: 11,
                    fontWeight: '900', marginTop: 7, textAlign: 'center' }}>{action.title}</Text>
                  <Text style={{ color: '#626A81', fontSize: 10,
                    marginTop: 2 }}>{action.detail}</Text>
                </TouchableOpacity>)}
            </View>

                        {/* Offline booking available on the passenger landing page. */}
            <TouchableOpacity onPress={() => router.push("/offline-booking")}
              accessibilityRole="button" accessibilityLabel="Offline booking: call or SMS"
              style={{ marginTop: 12, backgroundColor: "#EDF0FF", padding: 15, borderRadius: 16,
                borderWidth: 1, borderColor: "#DFE3F3" }}>
              <Text style={{ color: "#303A7C", fontWeight: "800", fontSize: 15 }}>
                No internet? Book by call or SMS  →
              </Text>
              <Text style={{ color: "#626A81", marginTop: 4, fontSize: 12 }}>
                Talk directly to our operator without mobile data.
              </Text>
            </TouchableOpacity>

            {/* Current location */}
            <Text className="text-xl font-JakartaBold text-may-navy mt-5 mb-3">
              Your current location
            </Text>

            <View
              style={{
                height: 230,
                width: "100%",
                borderRadius: 22,
                overflow: "hidden",
              }}
              className="bg-transparent"
            >
              {locationLoading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator
                    size="large"
                    color="#5969C7"
                  />
                  <Text className="mt-2 text-sm text-gray-500">
                    Getting location...
                  </Text>
                </View>
              ) : (
                <Map />
              )}
            </View>

            {/* Available ES4WAC taxis */}
            <View className="mt-5 bg-white rounded-2xl border border-may-lavender p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Text className="text-2xl mr-2">
                    {"🚕"}
                  </Text>

                  <View>
                    <Text className="text-lg font-JakartaBold">
                      ES4WAC taxis nearby
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
                    color="#5969C7"
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
                  className="mt-4 bg-primary-500 rounded-2xl min-h-14 py-3 items-center justify-center"
                >
                  <Text className="font-JakartaBold text-white">
                    Book a safe ES4WAC ride
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Recent rides */}
            <Text className="text-xl font-JakartaBold text-may-navy mt-5 mb-3">
              Recent Rides
            </Text>

            {/* View all rides */}
            <TouchableOpacity
              onPress={() =>
                router.push("/(root)/(tabs)/rides")
              }
              className="mt-2 mb-4 bg-white border border-may-lavender rounded-2xl p-4 shadow-sm flex-row items-center justify-between"
            >
              <View>
                <Text className="text-sm text-gray-500 mt-1">
                  View your previous trips and verify arrivals
                </Text>
              </View>

              <Text className="text-lg font-JakartaBold">
                {"→"}
              </Text>
            </TouchableOpacity>
          </>
        }
      />
    </SafeAreaView>
  );
};

export default Home;
