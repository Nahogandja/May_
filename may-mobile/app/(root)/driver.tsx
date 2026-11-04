import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
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
import {useAuthStore as getAuth} from "@/store/auth";
import RideRouteMap from "@/components/RideRouteMap";
import SOSButton from "@/components/SOSButton";
import { useAuthStore } from "@/store/auth";
import { useUpcomingRideReminder } from "@/hooks/useUpcomingRideReminder";

type DriverProfile = {
  gender?: string | null;
  phone?: string | null;
  license_number: string | null;
  vehicle_details: string | null;
  vehicle_color?:string|null;
  plate_number?:string|null;
  headshot_url?:string|null;
  certified_id_path?:string|null;
  certified_licence_path?:string|null;
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
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  status?: string | null;
  emergency_flag?: boolean;
  driver_finished?: boolean;
  safe_arrived?: boolean;
  created_at?: string;
  scheduled_for?:string|null;
};

const statusColor = (status?: string | null) => {
  switch ((status || "Pending").toLowerCase()) {
    case "active": return "#4961AD";
    case "completed": return "#475569";
    case "cancelled": return "#A65C32";
    default: return "#916332";
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
  useUpcomingRideReminder(user?.role === "Driver" ? "Driver" : undefined);

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [rides, setRides] = useState<DriverRide[]>([]);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [vehicleDetails, setVehicleDetails] = useState("");
  const [vehicleColor,setVehicleColor]=useState("");
  const [plateNumber,setPlateNumber]=useState("");
  const [uploadingPhoto,setUploadingPhoto]=useState(false);
  const [uploadingDocument,setUploadingDocument]=useState<"id"|"licence"|null>(null);
  const [gps,setGps]=useState<{latitude:number,longitude:number}|null>(null);
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
      setGender(nextProfile?.gender ?? "");
      setPhone(nextProfile?.phone ?? "");
      setVehicleDetails(nextProfile?.vehicle_details ?? "");
      setVehicleColor(nextProfile?.vehicle_color ?? "");
      setPlateNumber(nextProfile?.plate_number ?? "");
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

  // Discover incoming shared bookings while the driver is already on the road.
  // Poll only assignments so editing the expanded driver profile is not interrupted.
  useEffect(() => {
    if (user?.role !== "Driver") return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const result = await fetchAPI("/api/driver/rides");
        if (alive) setRides(toRideList(result));
      } catch (error) {
        console.warn("Driver assignments refresh failed", error);
      }
    }, 12000);
    return () => { alive = false; clearInterval(timer); };
  }, [user?.role]);

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

  // Foreground tracking only. No claim of background SOS/route protection.
  useEffect(()=>{
    if (!rides.some(r=>r.status==='Active') && !profile?.is_available) return;
    let sub:Location.LocationSubscription|null=null;
    let mounted=true;
    (async()=>{
      const perm=await Location.requestForegroundPermissionsAsync();
      if(perm.status!=="granted"||!mounted)return;
      sub=await Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,
        timeInterval:15000,distanceInterval:20},async position=>{
        if(!mounted)return;
        const latitude=position.coords.latitude,longitude=position.coords.longitude;
        setGps({latitude,longitude});
        try{await fetchAPI("/api/driver/location",{method:"PATCH",body:JSON.stringify({lat:latitude,lng:longitude})});}
        catch(error){console.warn("Driver GPS update failed",error);}
      });
    })().catch(error=>console.warn("Driver GPS watcher",error));
    return ()=>{mounted=false;sub?.remove();};
  },[rides.some(r=>r.status==='Active'),profile?.is_available]);

  // Show the driver's current position on the dashboard even while offline.
  // This read does not transmit or publish the position to the backend.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (mounted) setGps({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    })().catch((error) => console.warn("Driver map location unavailable", error));
    return () => { mounted = false; };
  }, []);

  const uploadHeadshot = async()=>{
    // Load only when requested: an older dev client can run the rest of ES4WOMEN&CHILDREN
    // even if expo-image-picker has not yet been compiled into its native APK.
    let ImagePicker: typeof import("expo-image-picker");
    try {
      ImagePicker = require("expo-image-picker");
    } catch {
      Alert.alert(
        "Driver photo unavailable",
        "Your installed Android development client doesn't include the image picker yet. The other application features work normally. Rebuild the development client once to enable driver photos."
      );
      return;
    }
    try {
      const selected=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,aspect:[1,1],quality:0.65});
      if(selected.canceled||!selected.assets?.[0])return;
      const asset=selected.assets[0];
      setUploadingPhoto(true);
      const body=new FormData();
      const isPng=asset.mimeType==="image/png";
      body.append("photo",{uri:asset.uri,name:isPng?"may-driver.png":"may-driver.jpg",
        type:isPng?"image/png":"image/jpeg"} as any);
      const response=await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/driver/headshot`,{
        method:"POST",headers:{Authorization:`Bearer ${getAuth.getState().token}`},body
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||"Photo upload failed");
      setProfile(old=>old?{...old,headshot_url:result.headshotUrl,vetting_status:"Pending",is_available:false}:old);
      await loadDashboard(false);
      Alert.alert("Headshot saved","Passengers can see your driver photo when selecting a taxi.");
    }catch(error){Alert.alert("Headshot error",error instanceof Error?error.message:"Try again");}
    finally{setUploadingPhoto(false);}
  };

  const uploadVerification = async (kind: "id" | "licence") => {
    let ImagePicker: typeof import("expo-image-picker");
    try {
      ImagePicker = require("expo-image-picker");
    } catch {
      Alert.alert("Image picker unavailable", "Install the updated ES4WOMEN&CHILDREN development client to select documents.");
      return;
    }
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (selection.canceled || !selection.assets?.[0]) return;

      setUploadingDocument(kind);
      const asset = selection.assets[0];
      const isPng = asset.mimeType === "image/png";
      const document = new FormData();
      document.append("document", {
        uri: asset.uri,
        name: `${kind}.${isPng ? "png" : "jpg"}`,
        type: isPng ? "image/png" : "image/jpeg",
      } as any);

      // Do not manually set Content-Type; fetch must add the multipart boundary.
      // EXPO_PUBLIC_USE_RN_FETCH=1 is already configured for this device.
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/driver/verification/${kind}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getAuth.getState().token}` },
          body: document,
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || "Document upload failed");

      await loadDashboard(false);
      Alert.alert(
        "Document submitted",
        "Your document is saved for administrator review. Your driver status stays pending until approved."
      );
    } catch (error) {
      Alert.alert("Document upload error", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setUploadingDocument(null);
    }
  };

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
      Alert.alert("Approval required", "Your driver profile must be approved by the administrator before you can go online.");
      return;
    }
    if (nextValue && isBusy && !activeRides.every(r => r.booking_mode === "Sharing")) {
      Alert.alert("Ride in progress", "Solo rides cannot accept additional bookings.");
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
    if (!/^\+?[0-9][0-9 +()\-]{6,20}$/.test(phone.trim())) {
      setDetailsExpanded(true);
      Alert.alert("Phone number required", "Enter your contact number for scheduled ride reminders.");
      return;
    }
    if (!gender) {
      setDetailsExpanded(true);
      Alert.alert("Gender required", "Select a gender option before saving your driver profile.");
      return;
    }
    if (!licenseNumber.trim() || !vehicleDetails.trim() || !vehicleColor.trim() || !plateNumber.trim()) {
      setDetailsExpanded(true);
      Alert.alert("Missing details", "Enter your licence number, vehicle description, colour and registration plate.");
      return;
    }
    setSavingProfile(true);
    try {
      const result = await fetchAPI("/api/driver/profile", {
        method: "PATCH",
        body: JSON.stringify({
          licenseNumber: licenseNumber.trim(),
          gender, phone: phone.trim(),
          vehicleDetails: vehicleDetails.trim(),
          vehicleColor:vehicleColor.trim(),plateNumber:plateNumber.trim(),
        }),
      });
      const updated = result?.profile ?? result;
      setProfile((previous) => previous ? { ...previous, ...updated } : updated);
      Alert.alert("Details saved", "Your driver details were submitted for review. Approval is required before going online.");
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
    Alert.alert("Sign out?", "You will be signed out of ES4WOMEN&CHILDREN.", [
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
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F7F8FC]">
        <ActivityIndicator size="large" color="#5969C7" />
        <Text className="mt-3 text-sm text-[#626A81]">Loading driver dashboard…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F8FC]">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
  className="flex-1"
  contentContainerStyle={{
    padding: 20,
    paddingBottom: 120,
    flexGrow: 1,
  }}
  showsVerticalScrollIndicator={true}
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
    />
  }
>
        <View className="mb-6 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold uppercase tracking-widest text-[#626A81]">ES4WOMEN&CHILDREN DRIVER</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#303A7C]">Hello, {user?.name || "Driver"}</Text>
            <Text className="mt-1 text-sm text-[#626A81]">Your trips, profile and availability</Text>
          </View>
          <TouchableOpacity onPress={signOut} className="rounded-xl border border-[#D9E0EA] bg-white px-4 py-3">
            <Text className="font-semibold text-[#303A7C]">Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Same always-visible map layout as the passenger dashboard. */}
        <View style={{ marginBottom: 7 }}>
          <Text className="mb-3 text-xl font-extrabold text-[#303A7C]">Your driver map</Text>
          <RideRouteMap
            rides={activeRides}
            driverLat={gps?.latitude ?? profile?.current_lat}
            driverLng={gps?.longitude ?? profile?.current_lng}
          />
        </View>

        {/* Completed/cancelled trips are not rendered in the dashboard list. */}
        <TouchableOpacity
          onPress={() => router.push("/(root)/driver-history")}
          accessibilityRole="button"
          className="mb-4 flex-row items-center justify-between rounded-2xl border border-[#DFE3F3] bg-white p-4"
        >
          <View>
            <Text className="text-base font-extrabold text-[#303A7C]">Ride history</Text>
            <Text className="mt-1 text-xs text-[#626A81]">View completed and cancelled trips</Text>
          </View>
          <Text className="text-xl font-bold text-[#5969C7]">→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/(root)/messages")}
          accessibilityRole="button"
          accessibilityLabel="Open driver messages"
          className="mb-4 flex-row items-center justify-between rounded-2xl border border-[#DFE3F3] bg-white p-4"
        >
          <View>
            <Text className="text-base font-extrabold text-[#303A7C]">Messages</Text>
            <Text className="mt-1 text-xs text-[#626A81]">Chat with passengers on assigned trips</Text>
          </View>
          <Text className="text-xl font-bold text-[#5969C7]">→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/(root)/wallet")}
          className="mb-4 rounded-2xl bg-[#5969C7] p-4"
        >
          <Text className="text-center text-base font-bold text-white">Driver earnings wallet (DEMO) →</Text>
        </TouchableOpacity>

        {error && (
          <View className="mb-4 rounded-2xl border border-[#EDCAA9] bg-white p-4">
            <Text className="font-bold text-[#A65C32]">Dashboard could not fully load</Text>
            <Text className="mt-1 text-sm text-[#475569]">{error}</Text>
            <TouchableOpacity onPress={() => loadDashboard()} className="mt-3 rounded-xl bg-[#303A7C] p-3">
              <Text className="text-center font-bold text-white">Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="mb-5 rounded-3xl bg-[#303A7C] p-5">
          <Text className="text-lg font-extrabold text-white">Driver approval</Text>
          <Text className="mt-2 text-base font-bold text-[#EDF0FF]">
            {profile?.vetting_status || "Profile not found"}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-[#DDE2FC]">
            {isApproved
              ? "Your profile is approved. You can go online when you have no unfinished rides."
              : profile?.vetting_status === "Rejected"
                ? "Your application was rejected. Contact support before attempting to drive."
                : "Your application is pending review. Complete your details and certified ID/licence uploads below."}
          </Text>
          <View className="mt-5 flex-row items-center justify-between border-t border-white/15 pt-4">
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold text-white">Availability</Text>
              <Text className="mt-1 text-sm text-[#DDE2FC]">
                {isBusy && activeRides.every(r => r.booking_mode === "Sharing")
                  ? (profile?.is_available ? "Online · accepting compatible shared pickups" : "Shared trip full, offline or paused")
                  : isBusy ? "Solo trip in progress" : profile?.is_available ? "You are online." : "You are offline."}
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
                trackColor={{ false: "#626A81", true: "#A8B3F3" }}
                thumbColor="#FFFFFF"
              />
            )}
          </View>
          {isBusy && <Text className="mt-3 text-xs text-[#FDE68A]">{activeRides.every(r => r.booking_mode === "Sharing")
            ? "Sharing: the system keeps you bookable only while seats and a compatible route are available. Tracking continues while driving."
            : "Solo: new bookings are paused until the ride is complete."}</Text>}
        </View>

        <View className="mb-5 overflow-hidden rounded-2xl border border-[#DFE3F3] bg-white">
          <TouchableOpacity
            onPress={() => setDetailsExpanded((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Driver and vehicle details"
            accessibilityState={{ expanded: detailsExpanded }}
            className="flex-row items-center justify-between p-5"
          >
            <View className="flex-1 pr-3">
              <Text className="text-lg font-extrabold text-[#303A7C]">Driver & vehicle details</Text>
              <Text className="mt-1 text-xs leading-5 text-[#626A81]">
                {profile?.gender ? "Edit your details, headshot and certified documents" : "Gender missing · open to finish your profile"}
              </Text>
            </View>
            <Text className="text-2xl font-bold text-[#5969C7]">{detailsExpanded ? "−" : "+"}</Text>
          </TouchableOpacity>
          {detailsExpanded && (
          <View className="border-t border-[#DFE3F3] px-5 pb-5">
          <Text className="mt-4 text-sm leading-5 text-[#626A81]">Keep these details accurate for administrator verification.</Text>
          <Text className="mb-2 mt-4 text-sm font-bold text-[#333B58]">Gender</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {(["Female", "Male", "Other", "Prefer not to say"] as const).map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => setGender(option)}
                disabled={savingProfile}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === option }}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: gender === option ? "#5969C7" : "#DFE3F3",
                  backgroundColor: gender === option ? "#EDF0FF" : "#FFFFFF",
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: "#303A7C", fontWeight: gender === option ? "800" : "500" }}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text className="mb-1 mt-4 text-sm font-bold text-[#333B58]">Phone number (required)</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="+264 ..." keyboardType="phone-pad"
            editable={!savingProfile} className="rounded-xl border border-[#DFE3F3] bg-white px-4 py-3 text-[#303A7C]" />
          <Text className="mb-1 mt-4 text-sm font-bold text-[#333B58]">Driver's licence number</Text>
          <TextInput
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            placeholder="Enter licence number"
            placeholderTextColor="#626A81"
            autoCapitalize="characters"
            editable={!savingProfile}
            className="rounded-xl border border-[#DFE3F3] bg-white px-4 py-3 text-[#303A7C]"
          />
          <Text className="mb-1 mt-4 text-sm font-bold text-[#333B58]">Vehicle details</Text>
          <TextInput
            value={vehicleDetails}
            onChangeText={setVehicleDetails}
            placeholder="Make, model, colour and registration"
            placeholderTextColor="#626A81"
            multiline
            editable={!savingProfile}
            className="min-h-20 rounded-xl border border-[#DFE3F3] bg-white px-4 py-3 text-[#303A7C]"
          />
          <Text style={{color:"#303A7C",fontWeight:"800",marginTop:15}}>Vehicle colour</Text>
          <TextInput value={vehicleColor} onChangeText={setVehicleColor} placeholder="e.g. White"
            style={{borderWidth:1,borderColor:"#DFE3F3",borderRadius:12,padding:13,marginTop:5}}/>
          <Text style={{color:"#303A7C",fontWeight:"800",marginTop:12}}>Registration / plate number</Text>
          <TextInput value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters"
            placeholder="e.g. N 12345 W" style={{borderWidth:1,borderColor:"#DFE3F3",borderRadius:12,padding:13,marginTop:5}}/>
          {!!profile?.headshot_url && <Image source={{uri:`${process.env.EXPO_PUBLIC_API_URL}${profile.headshot_url}`}}
            style={{height:90,width:90,borderRadius:45,marginTop:15}}/>}
          <TouchableOpacity disabled={uploadingPhoto} onPress={uploadHeadshot}
            style={{marginTop:14,borderColor:"#5969C7",borderWidth:1.5,padding:14,borderRadius:13}}>
            <Text style={{color:"#5969C7",fontWeight:"800",textAlign:"center"}}>
              {uploadingPhoto?"Uploading...":"Choose driver headshot"}
            </Text>
          </TouchableOpacity>
          <View className="mt-5 rounded-2xl border border-[#DFE3F3] bg-[#F7F8FC] p-4">
            <Text className="text-base font-extrabold text-[#303A7C]">Certified verification documents</Text>
            <Text className="mt-2 text-xs leading-5 text-[#626A81]">
              Upload clear photos of your certified ID and driver's licence. Only authorized administrators may review these documents.
            </Text>
            {(["id", "licence"] as const).map((kind) => {
              const submitted = Boolean(kind === "id" ? profile?.certified_id_path : profile?.certified_licence_path);
              const busy = uploadingDocument !== null;
              return (
                <TouchableOpacity
                  key={kind}
                  onPress={() => uploadVerification(kind)}
                  disabled={busy}
                  accessibilityRole="button"
                  style={{
                    marginTop: 12,
                    backgroundColor: "#EDF0FF",
                    borderColor: "#D2D7FF",
                    borderWidth: 1,
                    padding: 15,
                    borderRadius: 13,
                  }}
                >
                  <Text style={{ color: "#303A7C", fontWeight: "800", textAlign: "center" }}>
                    {kind === "id" ? "Certified ID" : "Certified driver's licence"} · {uploadingDocument === kind ? "Uploading…" : submitted ? "Submitted · Replace image" : "Upload image"}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text className="mt-3 text-xs text-[#626A81]">Uploading a replacement will require a new administrator review.</Text>
          </View>
          <TouchableOpacity
            onPress={saveProfile}
            disabled={savingProfile}
            className={`mt-4 rounded-xl p-4 ${savingProfile ? "bg-[#A49BB9]" : "bg-[#5969C7]"}`}
          >
            {savingProfile ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center font-extrabold text-white">Save driver details</Text>}
          </TouchableOpacity>
          </View>
          )}
        </View>

        <View className="mb-5 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-[#DFE3F3] bg-white p-4">
            <Text className="text-sm text-[#626A81]">Waiting</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#303A7C]">{pendingRides.length}</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-[#DFE3F3] bg-white p-4">
            <Text className="text-sm text-[#626A81]">Awaiting safety code</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#916332]">{waitingForPassenger.length}</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-[#DFE3F3] bg-white p-4">
            <Text className="text-sm text-[#626A81]">Completed</Text>
            <Text className="mt-1 text-2xl font-extrabold text-[#303A7C]">{completedRides.length}</Text>
          </View>
        </View>

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xl font-extrabold text-[#303A7C]">Current and upcoming rides</Text>
          <TouchableOpacity onPress={refresh} className="rounded-lg px-3 py-2">
            <Text className="font-bold text-[#5969C7]">Refresh</Text>
          </TouchableOpacity>
        </View>

        {activeRides.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-[#DFE3F3] bg-white px-5 py-10">
            <Text className="text-lg font-bold text-[#303A7C]">No active assignments</Text>
            <Text className="mt-2 text-center text-sm leading-5 text-[#626A81]">When a passenger is matched with you, the trip will appear here.</Text>
          </View>
        ) : activeRides.map((ride) => {
          const status = ride.status || "Pending";
          const isPending = status.toLowerCase() === "pending";
          const isActive = status.toLowerCase() === "active";
          const isWaitingForPassenger = isActive && ride.driver_finished === true && !ride.safe_arrived;
          const isBusyAction = actionRideId === ride.id;

          return (
            <View key={ride.id} className="mb-4 rounded-2xl border border-[#DFE3F3] bg-white p-5">
              <View className="mb-4 flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-extrabold text-[#303A7C]">{ride.passenger_name || "Passenger"}</Text>
                  {!!ride.passenger_phone && <Text className="mt-1 text-sm text-[#626A81]">{ride.passenger_phone}</Text>}
                </View>
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${statusColor(status)}18` }}>
                  <Text className="text-xs font-bold" style={{ color: statusColor(status) }}>{isWaitingForPassenger ? "Awaiting safe arrival" : status}</Text>
                </View>
              </View>

              <View className="mb-3 flex-row items-center justify-between">
                <Text className="font-bold text-[#5969C7]">
                  {ride.booking_mode === "Sharing" ? "Sharing · N$15 per passenger" : "Solo · N$30"}
                </Text>
                {ride.shared_trip_id && (
                  <Text className="text-xs text-[#626A81]">
                    Group {ride.shared_trip_id.slice(0, 8)}
                  </Text>
                )}
              </View>

              {ride.emergency_flag && (
                <View className="mb-3 rounded-xl bg-[#FFF1E3] p-3">
                  <Text className="font-bold text-[#A65C32]">Safety alert flagged for this ride</Text>
                  <Text className="mt-1 text-sm text-[#98542F]">Follow the emergency procedure and contact emergency services if needed.</Text>
                </View>
              )}

              <View className="mb-3 rounded-xl bg-[#F7F8FC] p-3">
                <Text className="text-xs font-bold uppercase tracking-wide text-[#626A81]">Pickup</Text>
                <Text className="mt-1 text-sm font-semibold text-[#303A7C]">{ride.pickup || "Pickup not provided"}</Text>
              </View>
              <View className="mb-3 rounded-xl bg-[#F7F8FC] p-3">
                <Text className="text-xs font-bold uppercase tracking-wide text-[#626A81]">Destination</Text>
                <Text className="mt-1 text-sm font-semibold text-[#303A7C]">{ride.dropoff || "Destination not provided"}</Text>
              </View>
              <Text className="mb-4 text-xs text-[#A49BB9]">Booked: {formatDate(ride.created_at)}</Text>

              <View style={{ marginBottom: 14, gap: 9 }}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Message passenger ${ride.passenger_name || ""}`}
                  onPress={() => router.push({ pathname: "/(root)/messages", params: { rideId: ride.id } })}
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: "#5969C7",
                    backgroundColor: "#EDF0FF", padding: 13 }}
                >
                  <Text style={{ color: "#303A7C", textAlign: "center", fontWeight: "800" }}>Messages · this passenger</Text>
                </TouchableOpacity>
                <SOSButton role="Driver" rideId={ride.id}
                  onRecorded={() => loadDashboard(false)}
                  fallbackLatitude={ride.pickup_lat ?? null}
                  fallbackLongitude={ride.pickup_lng ?? null} compact />
              </View>

              {isPending && (
                <TouchableOpacity disabled={isBusyAction} onPress={() => runRideAction(ride, "start")} className={`rounded-xl p-4 ${isBusyAction ? "bg-[#A49BB9]" : "bg-[#5969C7]"}`}>
                  {isBusyAction ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center font-extrabold text-white">Start ride</Text>}
                </TouchableOpacity>
              )}

              {isActive && !ride.driver_finished && (
                <TouchableOpacity disabled={isBusyAction} onPress={() => runRideAction(ride, "finish")} className={`rounded-xl border border-[#5969C7] p-4 ${isBusyAction ? "bg-[#F1F5F9]" : "bg-white"}`}>
                  {isBusyAction ? <ActivityIndicator color="#5969C7" /> : <Text className="text-center font-extrabold text-[#5969C7]">Reached destination</Text>}
                </TouchableOpacity>
              )}

              {isWaitingForPassenger && (
                <View className="rounded-xl bg-[#FEF3C7] p-4">
                  <Text className="font-bold text-[#916332]">Waiting for passenger confirmation</Text>
                  <Text className="mt-1 text-sm leading-5 text-[#916332]">Ask the passenger to enter their Safe Arrival Code in their passenger app. You remain unavailable until the system verifies the code.</Text>
                </View>
              )}
            </View>
          );
        })}

        <Text className="mt-3 text-center text-xs leading-5 text-[#A49BB9]">ES4WOMEN&CHILDREN · Tailored for Women and Children. Keep passenger information confidential.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
