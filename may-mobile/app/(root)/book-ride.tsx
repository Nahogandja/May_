
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CustomButton from "@/components/CustomButton";
import RideCompletionPrompt from "@/components/RideCompletionPrompt";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { fetchAPI } from "@/lib/fetch";
import { useLocationStore } from "@/store";

const BookRide = () => {
  const params = useLocalSearchParams<{
    driverId?: string;
    driverName?: string;
    vehicleDetails?: string;
    driverGender?: string;
    vehicleColor?: string;
    plateNumber?: string;
    headshotUrl?: string;
    bookingMode?: "Sharing" | "Solo";
    scheduleMinutes?:string;
  }>();

  const driverId = Array.isArray(params.driverId)
    ? params.driverId[0]
    : params.driverId;

  const driverName = Array.isArray(params.driverName)
    ? params.driverName[0]
    : params.driverName;

  const vehicleDetails = Array.isArray(params.vehicleDetails)
    ? params.vehicleDetails[0]
    : params.vehicleDetails;

  const bookingMode = params.bookingMode === "Sharing" ? "Sharing" : "Solo";
  const displayFare = bookingMode === "Sharing" ? 15 : 30;
  const scheduleMinutes=Math.max(0,Math.min(600,Number(params.scheduleMinutes)||0));

  const {
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    fetchAPI("/api/wallet")
      .then((result) => { if (active) setWalletBalance(result.balanceCents); })
      .catch(() => { if (active) setWalletBalance(null); });
    return () => { active = false; };
  }, []));

  const [submitting, setSubmitting] = useState(false);
  const [safeArrivalCode, setSafeArrivalCode] =
    useState<string | null>(null);
  const [driverAssigned, setDriverAssigned] = useState(false);

  const [enteredCode, setEnteredCode] = useState("");
  const [rideId, setRideId] =
    useState<string | number | null>(null);
  const [confirmingArrival, setConfirmingArrival] =
    useState(false);
  const [arrivalConfirmed, setArrivalConfirmed] =
    useState(false);
  const [showRating,setShowRating]=useState(false);

  const handleConfirmRide = async () => {
    if (!driverId) {
      Alert.alert(
        "Missing taxi",
        "Please return and select an available ES4WAC taxi."
      );
      return;
    }

    if (!userAddress || !destinationAddress) {
      Alert.alert(
        "Missing information",
        "Pickup and dropoff locations are required."
      );
      return;
    }

    if (
      typeof userLatitude !== "number" ||
      typeof userLongitude !== "number" ||
      typeof destinationLatitude !== "number" ||
      typeof destinationLongitude !== "number"
    ) {
      Alert.alert(
        "Missing information",
        "Valid pickup and destination coordinates are required."
      );
      return;
    }

    if (walletBalance !== null && walletBalance < displayFare * 100) {
      Alert.alert(
        "Insufficient wallet balance",
        `Your ES4WAC Wallet needs N$${displayFare}. Add funds to your test wallet before booking.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go to ES4WAC Wallet", onPress: () => router.push("/(root)/wallet") },
        ]
      );
      return;
    }
    if (submitting || safeArrivalCode) return;

    setSubmitting(true);

    try {
      const data = await fetchAPI("/api/rides/book", {
        method: "POST",
        body: JSON.stringify({
          pickup: userAddress,
          dropoff: destinationAddress,
          pickupLat: userLatitude,
          pickupLng: userLongitude,
          dropoffLat: destinationLatitude,
          dropoffLng: destinationLongitude,
          driverId,
          bookingMode,
          pricingCategory: "Standard",
          ...(scheduleMinutes>0?{scheduledFor:new Date(Date.now()+scheduleMinutes*60000).toISOString()}:{}),
        }),
      });

      if (!data?.ride?.id || !data?.ride?.safe_arrival_code) {
        throw new Error(
          data?.message ||
            "The booking response is missing ride details."
        );
      }

      setWalletBalance((current) => current === null ? null : Math.max(0, current - displayFare * 100));
      setSafeArrivalCode(data.ride.safe_arrival_code);
      setDriverAssigned(Boolean(data.driverAssigned));
      setRideId(data.ride.id);

      Alert.alert("Booking confirmed", scheduleMinutes>0?
        `Your ${bookingMode.toLowerCase()} ride is scheduled for ${new Date(Date.now()+scheduleMinutes*60000).toLocaleString()}.`:
        `Your ${bookingMode.toLowerCase()} ride has been reserved.`);
    } catch (err: any) {
      Alert.alert(
        "Booking Error",
        err?.message || "Booking failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const shareRideSMS=async()=>{
    if(!rideId)return;
    try{
      const result=await fetchAPI("/api/auth/safety-profile");
      const phone=String(result?.profile?.emergency_contact_phone||"").replace(/[^0-9+]/g,"");
      if(!phone){Alert.alert("Trusted contact","Add your emergency contact under Profile first.");return;}
      const body=`ES4WAC trip details\nDriver: ${driverName||"Assigned driver"}\nVehicle: ${params.vehicleColor||""} ${vehicleDetails||""}\nPlate: ${params.plateNumber||""}\nPickup: ${userAddress}\nDestination: ${destinationAddress}\nTrip ID: ${rideId}`;
      await Linking.openURL(`sms:${phone}?body=${encodeURIComponent(body)}`);
    }catch(err){Alert.alert("SMS","Open your phone's messaging app to share this ride.");}
  };

  const handleSubmitSafeArrival = async () => {
    if (rideId === null) {
      Alert.alert("Error", "Ride information is missing.");
      return;
    }

    if (!enteredCode.trim()) {
      Alert.alert(
        "Missing code",
        "Please enter your Safe Arrival Code."
      );
      return;
    }

    setConfirmingArrival(true);

    try {
      const result = await fetchAPI(
        `/api/rides/safe-arrival/${rideId}`,
        {
          method: "POST",
          body: JSON.stringify({
            code: enteredCode.trim().toUpperCase(),
          }),
        }
      );

      if (result?.message !== "Safe arrival confirmed") {
        throw new Error(
          result?.message ||
            "The Safe Arrival Code could not be verified."
        );
      }

      setArrivalConfirmed(true);
      setShowRating(true);
    } catch (err: any) {
      Alert.alert(
        "Unable to Confirm",
        err?.message ||
          "The driver must first mark the destination as reached."
      );
    } finally {
      setConfirmingArrival(false);
    }
  };

  return (
    <RideLayout
      title="Book Ride"
      sosRideId={safeArrivalCode && !arrivalConfirmed && rideId !== null ? String(rideId) : undefined}
      sosFallbackLatitude={userLatitude}
      sosFallbackLongitude={userLongitude}
    >
      <RideCompletionPrompt rideId={String(rideId || "")} visible={showRating}
        onDismiss={()=>setShowRating(false)}/>
      <View className="w-full mt-2">
        <Text className="text-xl font-JakartaBold text-may-navy mb-4">
          Confirm your ES4WAC ride
        </Text>

        <View className="mb-3 rounded-xl bg-may-blush p-3">
          <Text className="mt-3 text-sm font-JakartaSemiBold">
            ES4WAC Wallet: {walletBalance === null ? "Checking..." : `N$${(walletBalance / 100).toFixed(2)}`}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">
            Fare is deducted when you book. Cancellations before pickup are refunded.
          </Text>
          {!safeArrivalCode && (
            <TouchableOpacity
              onPress={() => router.push("/(root)/wallet")}
              className="mt-3 rounded-lg bg-primary-500 p-3"
            >
              <Text className="text-center font-JakartaBold text-white">Open ES4WAC Wallet</Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="flex-row items-center border-b border-gray-200 py-3">
          <Image source={icons.to} className="w-6 h-6" />
          <Text className="text-base ml-3 flex-1">
            {userAddress}
          </Text>
        </View>

        <View className="flex-row items-center border-b border-gray-200 py-3">
          <Image source={icons.point} className="w-6 h-6" />
          <Text className="text-base ml-3 flex-1">
            {destinationAddress}
          </Text>
        </View>

        <View className="mt-5 p-4 bg-may-page border border-may-lavender rounded-2xl">
          <Text className="text-lg font-JakartaBold">
            {driverName || "Selected ES4WAC Driver"}
          </Text>

          {!!params.headshotUrl && <Image source={{uri:`${process.env.EXPO_PUBLIC_API_URL}${params.headshotUrl}`}}
            style={{width:72,height:72,borderRadius:36,marginBottom:12,backgroundColor:"#EDF0FF"}}/>}
          <Text className="text-gray-500 mt-1">Gender: {params.driverGender || "Not provided"}</Text>
          <Text className="text-gray-500 mt-1">
            {vehicleDetails || "Standard ES4WAC Taxi"}
          </Text>
          <Text className="text-gray-500 mt-1">{params.vehicleColor || "Colour not provided"} · {params.plateNumber || "Plate not provided"}</Text>

          <Text className="mt-3 font-JakartaSemiBold">
            Booking Mode: {bookingMode}
          </Text>

          <Text className="mt-1 font-JakartaSemiBold">
            Vehicle Category: Standard
          </Text>

          <Text className="text-xl font-JakartaBold mt-3">
            Total Fare: N${displayFare.toFixed(2)}
          </Text>

        </View>
      </View>

      {!safeArrivalCode ? (
        <CustomButton
          title={
            submitting ? "Booking..." : "Confirm Booking"
          }
          onPress={handleConfirmRide}
          disabled={submitting || !driverId}
          className="mt-8"
        />
      ) : (
        <View className="w-full items-center mt-8">
          <Text className="text-lg font-JakartaSemiBold text-center">
            {driverAssigned
              ? "Ride booked, driver assigned"
              : "Ride booked, awaiting driver"}
          </Text>

          <TouchableOpacity onPress={shareRideSMS} style={{marginTop:14,backgroundColor:"#EDF0FF",padding:14,borderRadius:14}}>
            <Text style={{textAlign:"center",fontWeight:"800",color:"#303A7C"}}>Share trip by SMS with trusted contact</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>router.push({pathname:"/(root)/messages",params:{rideId:String(rideId)}})}
            style={{marginTop:10,backgroundColor:"#EDF0FF",padding:14,borderRadius:14}}>
            <Text style={{textAlign:"center",fontWeight:"800",color:"#303A7C"}}>Message your driver</Text>
          </TouchableOpacity>
          {!arrivalConfirmed ? (
            <>
              <Text className="mt-5 text-gray-500">
                Your Safe Arrival Code
              </Text>

              <Text className="text-3xl font-JakartaBold mt-2">
                {safeArrivalCode}
              </Text>

              <Text className="text-center text-gray-500 mt-5">
                Enter this code after your driver marks your destination as reached.
                For Sharing, each passenger verifies arrival independently.
              </Text>

              <BottomSheetTextInput
                value={enteredCode}
                onChangeText={setEnteredCode}
                placeholder="Enter Safe Arrival Code"
                autoCapitalize="characters"
                autoCorrect={false}
                className="border border-may-lavender bg-white rounded-2xl w-full mt-4 px-4 py-3 text-lg text-center text-may-navy"
              />

              <CustomButton
                title={
                  confirmingArrival
                    ? "Confirming..."
                    : "Confirm Safe Arrival"
                }
                onPress={handleSubmitSafeArrival}
                className="mt-5"
                disabled={confirmingArrival}
              />

              <CustomButton
                title="View My Rides"
                onPress={() =>
                  router.replace("/(root)/(tabs)/rides")
                }
                className="mt-4"
              />
            </>
          ) : (
            <>
              <Text className="text-lg font-JakartaBold mt-8">
                Safe Arrival Confirmed
              </Text>

              <Text className="text-center text-gray-500 mt-2">
                Your ride has been completed successfully.
              </Text>

              <CustomButton
                title="Back to Home"
                onPress={() =>
                  router.replace("/(root)/(tabs)/home")
                }
                className="mt-8"
              />
            </>
          )}
        </View>
      )}
    </RideLayout>
  );
};

export default BookRide;
