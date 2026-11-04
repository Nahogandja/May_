import { useState } from "react";
import {router} from "expo-router";
import RideCompletionPrompt from "@/components/RideCompletionPrompt";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { icons } from "@/constants";
import { formatDate } from "@/lib/utils";
import { fetchAPI } from "@/lib/fetch";
import { Ride } from "@/types/type";
import SOSButton from "@/components/SOSButton";

type RideCardProps = {
  ride: Ride;
  onVerified?: () => Promise<void>;
};

const RideCard = ({ ride, onVerified }: RideCardProps) => {
  const [enteredCode, setEnteredCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRating,setShowRating]=useState(false);

  const status = ride.status || "Pending";
  const readyForSafeArrival = status.toLowerCase() === "active" && ride.driver_finished === true;
  const awaitingDriver = status.toLowerCase() === "pending" || (status.toLowerCase() === "active" && !ride.driver_finished);

  const handleConfirmArrival = async () => {
    if (!enteredCode.trim()) {
      Alert.alert("Missing code", "Please enter your Safe Arrival Code.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetchAPI(`/api/rides/safe-arrival/${ride.id}`, {
        method: "POST",
        body: JSON.stringify({ code: enteredCode.trim().toUpperCase() }),
      });
      if (onVerified) await onVerified();
      Alert.alert(
        "Safe Arrival Confirmed",
        result?.driverAvailable
          ? "Your ride is completed. The taxi is available for another booking."
          : "Your ride is completed. The taxi stays reserved until all other passengers finish."
      );
      setEnteredCode("");
      setShowRating(true);
    } catch (error) {
      Alert.alert("Unable to Confirm", error instanceof Error ? error.message : "The Safe Arrival Code could not be verified.");
    } finally {
      setSubmitting(false);
    }
  };

  const shareRideSMS = async () => {
    try {
      const p=await fetchAPI("/api/auth/safety-profile");
      const phone=String(p?.profile?.emergency_contact_phone||"").replace(/[^+0-9]/g,"");
      if(!phone){Alert.alert("Trusted contact","Add a trusted contact in your profile.");return;}
      const text=`ES4WAC trip\nDriver: ${ride.driver_name||"Assigned driver"}\nPickup: ${ride.pickup}\nDestination: ${ride.dropoff}\nTrip reference: ${ride.id}`;
      await Linking.openURL(`sms:${phone}?body=${encodeURIComponent(text)}`);
    } catch(error) {Alert.alert("Share trip","Unable to open SMS on this phone.");}
  };

  const handleCancelRide = () => {
    if (submitting) return;
    Alert.alert("Cancel this booking?", "You can cancel before the driver starts the ride.", [
      { text: "Keep booking", style: "cancel" },
      {
        text: "Cancel ride",
        style: "destructive",
        onPress: async () => {
          setSubmitting(true);
          try {
            await fetchAPI(`/api/rides/cancel/${ride.id}`, { method: "PATCH" });
            if (onVerified) await onVerified();
            Alert.alert("Booking cancelled", "Your taxi reservation has been released.");
          } catch (err) {
            Alert.alert("Cancellation failed", err instanceof Error ? err.message : "Please try again.");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const statusColor =
    status.toLowerCase() === "completed" ? "text-indigo-700" :
    status.toLowerCase() === "cancelled" ? "text-amber-700" : "text-orange-600";

  return (
    <View className="mb-3 rounded-2xl border border-may-lavender bg-white shadow-sm shadow-neutral-200">
      <View className="w-full p-4">
        <View className="w-full gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <Image source={icons.to} className="h-5 w-5" />
            <Text className="flex-1 text-md font-JakartaMedium" numberOfLines={2}>{ride.pickup || "Pickup location unavailable"}</Text>
          </View>
          <View className="flex-row items-center gap-x-2">
            <Image source={icons.point} className="h-5 w-5" />
            <Text className="flex-1 text-md font-JakartaMedium" numberOfLines={2}>{ride.dropoff || "Destination unavailable"}</Text>
          </View>
        </View>

        <View className="mt-4 w-full rounded-xl bg-may-page p-3">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Date</Text>
            <Text className="ml-3 flex-1 text-right text-md font-JakartaBold">{formatDate(ride.created_at)}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Driver</Text>
            <Text className="ml-3 flex-1 text-right text-md font-JakartaBold">{ride.driver_name || "Awaiting driver"}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Status</Text>
            <Text className={`font-JakartaBold capitalize ${statusColor}`}>{status.replace(/_/g, " ")}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Booking</Text>
            <Text className="font-JakartaBold">{(ride as Ride & { booking_mode?: string }).booking_mode || "Sharing"}</Text>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-md font-JakartaMedium text-gray-500">Fare</Text>
            <Text className="font-JakartaBold">
              {ride.fare != null ? `N$${Number(ride.fare).toFixed(2)}` : "Not recorded"}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-md font-JakartaMedium text-gray-500">Safe Arrival Code</Text>
            <Text className="ml-3 font-JakartaBold">{ride.safe_arrival_code || "Not available"}</Text>
          </View>
        </View>

        {(ride as Ride & { arrival_code_rotated_at?: string | null }).arrival_code_rotated_at &&
          status.toLowerCase() === 'active' &&
          <Text style={{ color: '#4757B2', fontSize: 12, marginTop: 8, fontWeight: '700' }}>
            Your original code was refreshed after five minutes. Use the code shown above.
          </Text>}
        {ride.safety_status && ride.safety_status!=="Normal" && status.toLowerCase()==="active" &&
          <View style={{backgroundColor:"#FFF6ED",borderWidth:1,borderColor:"#EDCAA9",borderRadius:12,padding:12,marginTop:12}}>
            <Text style={{color:"#A65C32",fontWeight:"900"}}>Active safety review: {ride.safety_status}</Text>
            <Text style={{color:"#98542F",fontSize:12,marginTop:5}}>If you reported danger, the safety team must review it. Do not enter an arrival code until you are safe.</Text>
          </View>}
        {awaitingDriver && (
          <View className="mt-4 rounded-lg bg-amber-50 p-3">
            <Text className="font-JakartaSemiBold text-amber-800">Ride in progress</Text>
            <Text className="mt-1 text-sm leading-5 text-amber-800">When your driver reaches the destination and marks arrival, enter your Safe Arrival Code here.</Text>
          </View>
        )}

        {(status.toLowerCase()==="pending"||status.toLowerCase()==="active")&&<View style={{marginTop:11,gap:8}}>
          <Pressable onPress={shareRideSMS} style={{borderRadius:12,padding:13,backgroundColor:"#EDF0FF"}}>
            <Text style={{textAlign:"center",fontWeight:"800",color:"#303A7C"}}>Share trip by SMS</Text>
          </Pressable>
          <Pressable onPress={()=>router.push({pathname:"/(root)/messages",params:{rideId:String(ride.id)}})}
            style={{borderRadius:12,padding:13,backgroundColor:"#EDF0FF"}}>
            <Text style={{textAlign:"center",fontWeight:"800",color:"#303A7C"}}>Messages with driver</Text>
          </Pressable>
        </View>}

        {(status.toLowerCase() === "pending" || status.toLowerCase() === "active") && (
          <SOSButton
            rideId={String(ride.id)}
            fallbackLatitude={ride.pickup_lat}
            fallbackLongitude={ride.pickup_lng}
          />
        )}

        {status.toLowerCase() === "pending" && (
          <Pressable
            onPress={handleCancelRide}
            disabled={submitting}
            className="mt-3 items-center rounded-lg border border-amber-300 bg-amber-50 p-3"
          >
            <Text className="font-JakartaBold text-amber-700">
              {submitting ? "Cancelling..." : "Cancel pending booking"}
            </Text>
          </Pressable>
        )}

        {status.toLowerCase()==="completed" && !ride.rating && <Pressable onPress={()=>setShowRating(true)}
          style={{backgroundColor:"#EDF0FF",marginTop:12,borderRadius:12,padding:14,alignItems:"center"}}>
          <Text style={{color:"#5969C7",fontWeight:"900"}}>Rate your completed ride ★</Text>
        </Pressable>}
        <RideCompletionPrompt rideId={String(ride.id)} visible={showRating}
          onDismiss={()=>setShowRating(false)} onRated={()=>{onVerified?.();}} />
        {readyForSafeArrival && (
          <View className="mt-4">
            <Text className="mb-2 font-JakartaSemiBold">Confirm your safe arrival</Text>
            <Text className="mb-3 text-sm leading-5 text-gray-600">Enter the code only after you have safely exited the vehicle. For shared rides, the driver is released only after every passenger confirms.</Text>
            <TextInput
              value={enteredCode}
              onChangeText={(text) => setEnteredCode(text.toUpperCase())}
              placeholder="Enter your 6-character code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              editable={!submitting}
              className="mb-3 min-h-14 rounded-2xl border border-may-lavender bg-white px-4 py-3 font-JakartaMedium text-may-navy"
            />
            <Pressable
              onPress={handleConfirmArrival}
              disabled={submitting || !enteredCode.trim()}
              className={`min-h-12 items-center justify-center rounded-lg px-4 py-3 ${submitting || !enteredCode.trim() ? "bg-gray-400" : "bg-primary-500"}`}
            >
              {submitting ? <ActivityIndicator color="#ffffff" /> : <Text className="font-JakartaBold text-white">Confirm Safe Arrival</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};

export default RideCard;
