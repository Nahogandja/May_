import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchAPI } from "@/lib/fetch";
import { useAuthStore } from "@/store/auth";

type DriverProfile = {
  license_number: string | null;
  vehicle_details: string | null;
  vetting_status: "Pending" | "Approved" | "Rejected" | string;
  background_check: boolean;
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
};

type DriverRide = {
  id: string;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  booking_mode?: "Sharing" | "Solo";
  shared_trip_id?: string | null;
  fare?: number | string | null;
  pickup?: string | null;
  dropoff?: string | null;
  status?: string | null;
  emergency_flag?: boolean;
  driver_finished?: boolean;
  safe_arrived?: boolean;
  created_at?: string;
};

const statusColor = (status?: string | null) => {
  switch ((status || "Pending").toLowerCase()) {
    case "active": return "#176B3A";
    case "completed": return "#475569";
    case "cancelled": return "#B42318";
    default: return "#9A6700";
  }
};

const formatDate = (value?: string) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
};

const toRideList = (value: any): DriverRide[] =>
  Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

export default function DriverDashboard() {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [rides, setRides] = useState<DriverRide[]>([]);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [vehicleDetails, setVehicleDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [actionRideId, setActionRideId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [profileResult, rideResult] = await Promise.all([
        fetchAPI("/api/driver/profile"),
        fetchAPI("/api/driver/rides"),
      ]);
      const nextProfile: DriverProfile = profileResult?.profile ?? profileResult;
      setProfile(nextProfile);
      setLicenseNumber(nextProfile?.license_number ?? "");
      setVehicleDetails(nextProfile?.vehicle_details ?? "");
      setRides(toRideList(rideResult));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the driver dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== "Driver") {
      router.replace(user?.role === "Admin" ? "/admin" : "/(root)/(tabs)/home");
      return;
    }
    loadDashboard();
  }, [loadDashboard, user?.role]);

  const activeRides = useMemo(
    () => rides.filter((ride) => ["active", "pending"].includes((ride.status || "").toLowerCase())),
    [rides]
  );
  const pendingRides = rides.filter((ride) => (ride.status || "").toLowerCase() === "pending");
  const currentRides = rides.filter((ride) => {
    const status = (ride.status || "").toLowerCase();
    return status === "pending" || (status === "active" && !ride.driver_finished);
  });
  const waitingForPassenger = rides.filter(
    (ride) => (ride.status || "").toLowerCase() === "active" && ride.driver_finished && !ride.safe_arrived
  );
  const completedRides = rides.filter((ride) => (ride.status || "").toLowerCase() === "completed");
  const isBusy = activeRides.length > 0;
  const isApproved = profile?.vetting_status === "Approved";

  const refresh = async () => {
    setRefreshing(true);
    try { await loadDashboard(false); }
    finally { setRefreshing(false); }
  };

  const updateDriverLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error("Location permission is required to share your position while online.");
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await fetchAPI("/api/driver/location", {
      method: "PATCH",
      body: JSON.stringify({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }),
    });
  };

  const toggleAvailability = async (nextValue: boolean) => {
    if (!profile || availabilityLoading) return;
    if (nextValue && !isApproved) {
      Alert.alert("Approval required", "Your driver profile must be approved by May before you can go online.");
      return;
    }
    if (nextValue && isBusy) {
      Alert.alert("Ride in progress", "Finish the assigned ride and wait for the passenger to confirm safe arrival before going online.");
      return;
    }

    setAvailabilityLoading(true);
    try {
      const result = await fetchAPI("/api/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({ isAvailable: nextValue }),
      });
      setProfile((previous) => previous
        ? { ...previous, is_available: Boolean(result?.isAvailable ?? nextValue) }
        : previous);

      if (nextValue) {
        try {
          await updateDriverLocation();
        } catch (locationError) {
          Alert.alert(
            "Location not updated",
            locationError instanceof Error
              ? `${locationError.message} You are online, but passengers may not see your current location.`
              : "You are online, but your location could not be updated."
          );
        }
      }
      await loadDashboard(false);
    } catch (err) {
      Alert.alert("Availability not changed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const saveProfile = async () => {
    if (savingProfile) return;
    if (!licenseNumber.trim() || !vehicleDetails.trim()) {
      Alert.alert("Missing details", "Enter your driver's licence number and vehicle details.");
      return;
    }
    setSavingProfile(true);
    try {
      const result = await fetchAPI("/api/driver/profile", {
        method: "PATCH",
        body: JSON.stringify({
          licenseNumber: licenseNumber.trim(),
          vehicleDetails: vehicleDetails.trim(),
        }),
      });
      const updated = result?.profile ?? result;
      setProfile((previous) => previous ? { ...previous, ...updated } : updated);
      Alert.alert("Details saved", "Your driver details have been submitted. May must approve your profile before you can go online.");
    } catch (err) {
      Alert.alert("Could not save details", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const runRideAction = (ride: DriverRide, action: "start" | "finish") => {
    if (!ride.id || actionRideId) return;
    const isStart = action === "start";
    Alert.alert(
      isStart ? "Start this ride?" : "Confirm destination reached?",
      isStart
        ? `Confirm that you have picked up ${ride.passenger_name || "the passenger"}.`
        : "Only confirm once you have reached the passenger's destination. The passenger must still enter their Safe Arrival Code before the ride is completed and you are released.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isStart ? "Start ride" : "I reached the destination",
          onPress: async () => {
            setActionRideId(ride.id);
            try {
              await fetchAPI(
                isStart ? `/api/driver/start-ride/${ride.id}` : `/api/driver/end-ride/${ride.id}`,
                { method: "PATCH" }
              );
              await loadDashboard(false);
              Alert.alert(
                isStart ? "Ride started" : "Waiting for passenger",
                isStart
                  ? "Drive safely. The passenger will confirm safe arrival at the end."
                  : "Each passenger must confirm their own Safe Arrival Code. You remain unavailable until all passengers finish."
              );
            } catch (err) {
              Alert.alert("Ride update failed", err instanceof Error ? err.message : "Please try again.");
            } finally {
              setActionRideId(null);
            }
          },
        },
      ]
    );
  };

  const signOut = () => {
    Alert.alert("Sign out?", "You will be signed out of May.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          clearAuth();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F5F7FA]">
        <ActivityIndicator size="large" color="#176B3A" />
        <Text className="mt-3 text-sm text-[#64748B]">Loading driver dashboard…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F5F7FA]">
      <ScrollView
  className="flex-1"
  contentContainerStyle={{
    padding: 20,
    paddingBottom: 120,
    flexGrow: 1,
  }}
  showsVerticalScrollIndicator={true}
  keyboardShouldPersistTaps="handled"
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
    />
  }
>
        <View className="mb-6 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold uppercase tracking-widest text-[#64748B]">MAY DRIVER</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#14213D]">Hello, {user?.name || "Driver"}</Text>
            <Text className="mt-1 text-sm text-[#64748B]">Your trips, profile and availability</Text>
          </View>
          <TouchableOpacity onPress={signOut} className="rounded-xl border border-[#D9E0EA] bg-white px-4 py-3">
            <Text className="font-semibold text-[#14213D]">Sign out</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View className="mb-4 rounded-2xl border border-[#FECACA] bg-white p-4">
            <Text className="font-bold text-[#B42318]">Dashboard could not fully load</Text>
            <Text className="mt-1 text-sm text-[#475569]">{error}</Text>
            <TouchableOpacity onPress={() => loadDashboard()} className="mt-3 rounded-xl bg-[#14213D] p-3">
              <Text className="text-center font-bold text-white">Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="mb-5 rounded-3xl bg-[#14213D] p-5">
          <Text className="text-lg font-extrabold text-white">Driver approval</Text>
          <Text className="mt-2 text-base font-bold text-[#A7F3D0]">
            {profile?.vetting_status || "Profile not found"}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-[#D5DEEA]">
            {isApproved
              ? "Your profile is approved. You can go online when you have no unfinished rides."
              : profile?.vetting_status === "Rejected"
                ? "Your application was rejected. Contact May support before attempting to drive."
                : "Your application is pending review. Complete your licence and vehicle details below."}
          </Text>
          <View className="mt-5 flex-row items-center justify-between border-t border-white/15 pt-4">
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold text-white">Availability</Text>
              <Text className="mt-1 text-sm text-[#D5DEEA]">
                {isBusy ? "You have an unfinished ride." : profile?.is_available ? "You are online." : "You are offline."}
              </Text>
            </View>
            {availabilityLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Switch
                accessibilityLabel="Go online or offline"
                value={profile?.is_available === true}
                onValueChange={toggleAvailability}
                disabled={!profile || (!isApproved && !profile.is_available) || isBusy}
                trackColor={{ false: "#64748B", true: "#63D5A3" }}
                thumbColor="#FFFFFF"
              />
            )}
          </View>
          {isBusy && <Text className="mt-3 text-xs text-[#FDE68A]">You cannot go online again until the passenger confirms safe arrival.</Text>}
        </View>

        <View className="mb-5 rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <Text className="text-lg font-extrabold text-[#14213D]">Driver and vehicle details</Text>
          <Text className="mt-1 text-sm leading-5 text-[#64748B]">Keep these details accurate so May can review your application.</Text>
          <Text className="mb-1 mt-4 text-sm font-bold text-[#334155]">Driver's licence number</Text>
          <TextInput
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            placeholder="Enter licence number"
            autoCapitalize="characters"
            editable={!savingProfile}
            className="rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-[#14213D]"
          />
          <Text className="mb-1 mt-4 text-sm font-bold text-[#334155]">Vehicle details</Text>
          <TextInput
            value={vehicleDetails}
            onChangeText={setVehicleDetails}
            placeholder="Make, model, colour and registration"
            multiline
            editable={!savingProfile}
            className="min-h-20 rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-[#14213D]"
          />
          <TouchableOpacity
            onPress={saveProfile}
            disabled={savingProfile}
            className={`mt-4 rounded-xl p-4 ${savingProfile ? "bg-[#94A3B8]" : "bg-[#176B3A]"}`}
          >
            {savingProfile ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center font-extrabold text-white">Save driver details</Text>}
          </TouchableOpacity>
        </View>

        <View className="mb-5 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-[#E2E8F0] bg-white p-4">
            <Text className="text-sm text-[#64748B]">Waiting</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#14213D]">{pendingRides.length}</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-[#E2E8F0] bg-white p-4">
            <Text className="text-sm text-[#64748B]">Awaiting safety code</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#9A6700]">{waitingForPassenger.length}</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-[#E2E8F0] bg-white p-4">
            <Text className="text-sm text-[#64748B]">Completed</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#14213D]">{completedRides.length}</Text>
          </View>
        </View>

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xl font-extrabold text-[#14213D]">Assigned rides</Text>
          <TouchableOpacity onPress={refresh} className="rounded-lg px-3 py-2">
            <Text className="font-bold text-[#176B3A]">Refresh</Text>
          </TouchableOpacity>
        </View>

        {rides.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-5 py-10">
            <Text className="text-lg font-bold text-[#14213D]">No assigned rides yet</Text>
            <Text className="mt-2 text-center text-sm leading-5 text-[#64748B]">When a passenger is matched with you, the trip will appear here.</Text>
          </View>
        ) : rides.map((ride) => {
          const status = ride.status || "Pending";
          const isPending = status.toLowerCase() === "pending";
          const isActive = status.toLowerCase() === "active";
          const isWaitingForPassenger = isActive && ride.driver_finished === true && !ride.safe_arrived;
          const isBusyAction = actionRideId === ride.id;

          return (
            <View key={ride.id} className="mb-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
              <View className="mb-4 flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-extrabold text-[#14213D]">{ride.passenger_name || "Passenger"}</Text>
                  {!!ride.passenger_phone && <Text className="mt-1 text-sm text-[#64748B]">{ride.passenger_phone}</Text>}
                </View>
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${statusColor(status)}18` }}>
                  <Text className="text-xs font-bold" style={{ color: statusColor(status) }}>{isWaitingForPassenger ? "Awaiting safe arrival" : status}</Text>
                </View>
              </View>

              <View className="mb-3 flex-row items-center justify-between">
                <Text className="font-bold text-[#176B3A]">
                  {ride.booking_mode === "Sharing" ? "Sharing · N$15 per passenger" : "Solo · N$30"}
                </Text>
                {ride.shared_trip_id && (
                  <Text className="text-xs text-[#64748B]">
                    Group {ride.shared_trip_id.slice(0, 8)}
                  </Text>
                )}
              </View>

              {ride.emergency_flag && (
                <View className="mb-3 rounded-xl bg-[#FEE2E2] p-3">
                  <Text className="font-bold text-[#B42318]">Safety alert flagged for this ride</Text>
                  <Text className="mt-1 text-sm text-[#7F1D1D]">Follow May's emergency procedure and contact emergency services if needed.</Text>
                </View>
              )}

              <View className="mb-3 rounded-xl bg-[#F8FAFC] p-3">
                <Text className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Pickup</Text>
                <Text className="mt-1 text-sm font-semibold text-[#14213D]">{ride.pickup || "Pickup not provided"}</Text>
              </View>
              <View className="mb-3 rounded-xl bg-[#F8FAFC] p-3">
                <Text className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Destination</Text>
                <Text className="mt-1 text-sm font-semibold text-[#14213D]">{ride.dropoff || "Destination not provided"}</Text>
              </View>
              <Text className="mb-4 text-xs text-[#94A3B8]">Booked: {formatDate(ride.created_at)}</Text>

              {isPending && (
                <TouchableOpacity disabled={isBusyAction} onPress={() => runRideAction(ride, "start")} className={`rounded-xl p-4 ${isBusyAction ? "bg-[#94A3B8]" : "bg-[#176B3A]"}`}>
                  {isBusyAction ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center font-extrabold text-white">Start ride</Text>}
                </TouchableOpacity>
              )}

              {isActive && !ride.driver_finished && (
                <TouchableOpacity disabled={isBusyAction} onPress={() => runRideAction(ride, "finish")} className={`rounded-xl border border-[#176B3A] p-4 ${isBusyAction ? "bg-[#F1F5F9]" : "bg-white"}`}>
                  {isBusyAction ? <ActivityIndicator color="#176B3A" /> : <Text className="text-center font-extrabold text-[#176B3A]">Reached destination</Text>}
                </TouchableOpacity>
              )}

              {isWaitingForPassenger && (
                <View className="rounded-xl bg-[#FEF3C7] p-4">
                  <Text className="font-bold text-[#92400E]">Waiting for passenger confirmation</Text>
                  <Text className="mt-1 text-sm leading-5 text-[#92400E]">Ask the passenger to enter their Safe Arrival Code in their May app. You remain unavailable until May verifies the code.</Text>
                </View>
              )}
            </View>
          );
        })}

        <Text className="mt-3 text-center text-xs leading-5 text-[#94A3B8]">May — Safe for Her. Keep passenger information confidential and follow safety procedures on every trip.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
