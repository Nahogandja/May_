import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CustomButton from "@/components/CustomButton";
import RideLayout from "@/components/RideLayout";
import { fetchAPI } from "@/lib/fetch";
import { useLocationStore } from "@/store";

type BookingMode = "Solo" | "Sharing";
type AvailableCab = {
  driverId: string;
  driverName: string;
  driverGender?: string | null;
  vehicleColor?: string | null;
  plateNumber?: string | null;
  headshotUrl?: string | null;
  vehicleDetails: string | null;
  category: string;
  seatCapacity: number;
  seatsAvailable: number;
  distanceKm: number;
  fare: number;
  joiningGroup: boolean;
  estimatedWaitMinutes?: number | null;
  etaNote?: string;
};

const FARES: Record<BookingMode, number> = { Sharing: 15, Solo: 30 };

const ConfirmRide = () => {
  const {
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();
  const [bookingMode, setBookingMode] = useState<BookingMode>("Sharing");
  const [advanceMinutes,setAdvanceMinutes]=useState(0);
  const choices=[0,30,60,120,240,360,480,600];
  const [cabs, setCabs] = useState<AvailableCab[]>([]);
  const [selectedCab, setSelectedCab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const loadCabs = useCallback(async () => {
    const current = ++requestId.current;
    setSelectedCab(null);
    setError("");
    if (
      typeof userLatitude !== "number" ||
      typeof userLongitude !== "number" ||
      typeof destinationLatitude !== "number" ||
      typeof destinationLongitude !== "number"
    ) {
      setCabs([]);
      setError("Choose valid pickup and destination locations first.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({
        lat: String(userLatitude),
        lng: String(userLongitude),
        dropoffLat: String(destinationLatitude),
        dropoffLng: String(destinationLongitude),
        radius: "10",
        bookingMode,
        category: "Standard",
        ...(advanceMinutes ? {scheduledFor:new Date(Date.now()+advanceMinutes*60000).toISOString()} : {}),
      });
      const data = await fetchAPI(`/api/rides/available-cabs?${query}`);
      if (!Array.isArray(data)) throw new Error("Unexpected availability response");
      if (current === requestId.current) setCabs(data);
    } catch (err) {
      if (current === requestId.current) {
        setCabs([]);
        setError(err instanceof Error ? err.message : "Could not load available taxis");
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [bookingMode, advanceMinutes, userLatitude, userLongitude, destinationLatitude, destinationLongitude]);

  useEffect(() => {
    loadCabs();
    return () => { requestId.current += 1; };
  }, [loadCabs]);

  const handleContinue = () => {
    const cab = cabs.find((item) => String(item.driverId) === selectedCab);
    if (!cab) return;
    router.push({
      pathname: "/(root)/book-ride",
      params: {
        driverId: String(cab.driverId),
        driverName: cab.driverName,
        driverGender: cab.driverGender || "",
        vehicleColor: cab.vehicleColor || "",
        plateNumber: cab.plateNumber || "",
        headshotUrl: cab.headshotUrl || "",
        vehicleDetails: cab.vehicleDetails ?? "",
        bookingMode,
        scheduleMinutes:String(advanceMinutes),
      },
    });
  };

  return (
    <RideLayout title="Choose a safe ES4WAC ride" snapPoints={["62%", "92%"]}>
      <View style={{ width: "100%", paddingBottom: 20 }}>
        <Text className="text-xl font-JakartaBold mt-3 text-may-navy">How would you like to travel?</Text>
        <View className="flex-row mt-4 mb-3" style={{ gap: 12 }}>
          {(["Sharing", "Solo"] as BookingMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setBookingMode(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected: bookingMode === mode }}
              className={`flex-1 rounded-xl border-2 p-4 ${
                bookingMode === mode ? "border-primary-500 bg-may-blush" : "border-gray-200 bg-white"
              }`}
            >
              <Text className="text-base font-JakartaBold">{mode}</Text>
              <Text className="text-lg font-JakartaBold mt-1">N${FARES[mode]}</Text>
              <Text className="text-xs text-gray-500 mt-1">
                {mode === "Sharing" ? "Per passenger" : "Exclusive taxi"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text className="text-sm text-gray-600 mb-4">
          {bookingMode === "Sharing"
            ? "Share with passengers heading to nearby pickup and destination areas. Taxis are matched based on pickup and destination areas."
            : "Reserve the entire Standard taxi for your ride."}
        </Text>

        <Text style={{color:"#303A7C",fontSize:16,fontWeight:"800",marginTop:8,marginBottom:10}}>
          When do you want to leave?
        </Text>
        {/* All scheduled departures visible in two rows */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {choices.map(min=><TouchableOpacity key={min} onPress={()=>setAdvanceMinutes(min)}
            style={{backgroundColor:advanceMinutes===min?"#303A7C":"#EDF0FF",paddingVertical:12,
              paddingHorizontal: 6, borderRadius: 12, width: "22%", flexGrow: 1, alignItems: "center", justifyContent: "center", minHeight: 46}}>
              <Text style={{color:advanceMinutes===min?"#FFFFFF":"#303A7C",fontWeight:"800"}}>
                {min===0?"Now":min<60?`${min} min`:`${min/60} hrs`}
              </Text>
          </TouchableOpacity>)}
        </View>
        {advanceMinutes>0&&<Text style={{color:"#626A81",marginBottom:12,fontSize:12}}>
          Requested pickup: {new Date(Date.now()+advanceMinutes*60000).toLocaleString()}. Maximum 10 hours ahead.
        </Text>}
        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color="#5969C7" />
            <Text className="mt-3 text-gray-500">Checking taxi availability...</Text>
          </View>
        ) : error ? (
          <View className="items-center py-8">
            <Text className="text-amber-600 text-center">{error}</Text>
          </View>
        ) : cabs.length === 0 ? (
          <View className="items-center py-10">
            <Text className="text-lg font-JakartaBold">No eligible taxis available</Text>
            <Text className="text-gray-500 text-center mt-2">
              Try another mode or refresh. Sharing taxis appear when your pickup and destination fit their remaining route and seats are available.
            </Text>
          </View>
        ) : (
          <>
            <Text className="font-JakartaSemiBold mb-3">
              {cabs.length} eligible {cabs.length === 1 ? "taxi" : "taxis"}
            </Text>
            {cabs.map((cab) => {
              const id = String(cab.driverId);
              const selected = selectedCab === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setSelectedCab(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`rounded-2xl p-4 mb-3 border-2 bg-white ${
                    selected ? "border-primary-500" : "border-gray-200"
                  }`}
                >
                  <View className="flex-row justify-between items-start">
                    {cab.headshotUrl ? <Image source={{uri:`${process.env.EXPO_PUBLIC_API_URL}${cab.headshotUrl}`}}
                      style={{width:58,height:58,borderRadius:30,marginRight:12,backgroundColor:"#EDF0FF"}}/> :
                      <View style={{width:46,height:46,borderRadius:24,backgroundColor:"#EDF0FF",marginRight:10,justifyContent:"center",alignItems:"center"}}>
                        <Text style={{fontSize:22,color:"#5969C7"}}>🚕</Text>
                      </View>}
                    <View className="flex-1 pr-3">
                      <Text className="text-lg font-JakartaBold">{cab.driverName || "ES4WAC Driver"}</Text>
                      <Text className="text-sm text-gray-500 mt-1">Gender: {cab.driverGender || "Not provided"}</Text>
                      <Text className="text-sm text-gray-500 mt-1">
                        {cab.vehicleDetails || "Standard ES4WAC Taxi"}
                      </Text>
                      <Text className="text-sm text-gray-500 mt-1">Colour: {cab.vehicleColor || "Not provided"} · Plate: {cab.plateNumber || "Not provided"}</Text>
                      <Text className="text-sm text-gray-500 mt-1">
                        {Number.isFinite(cab.distanceKm) ? `${cab.distanceKm.toFixed(1)} km away` : "Distance unavailable"}
                      </Text>
                      {advanceMinutes === 0 && typeof cab.estimatedWaitMinutes === "number" && (
                        <Text style={{ color: "#303A7C", fontWeight: "800", marginTop: 7 }}>
                          Estimated pickup wait: about {cab.estimatedWaitMinutes} min
                        </Text>
                      )}
                      {bookingMode === "Sharing" && (
                        <Text className="text-sm text-gray-600 mt-2">
                          {cab.seatsAvailable} seats left
                          {cab.joiningGroup ? " · Driver is already on a shared trip (additional stops may affect ETA)" : " · New shared trip"}
                        </Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-lg font-JakartaBold">N${FARES[bookingMode]}</Text>
                      <Text className={`mt-3 font-JakartaBold ${selected ? "text-primary-500" : "text-gray-400"}`}>
                        {selected ? "Selected" : "Select"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <TouchableOpacity onPress={loadCabs} disabled={loading} className="items-center py-3">
          <Text className="text-primary-500 font-JakartaSemiBold">Refresh available taxis</Text>
        </TouchableOpacity>
        <CustomButton
          title="Continue to Booking"
          onPress={handleContinue}
          disabled={!selectedCab || loading}
          className="mt-4"
        />
      </View>
    </RideLayout>
  );
};

export default ConfirmRide;
