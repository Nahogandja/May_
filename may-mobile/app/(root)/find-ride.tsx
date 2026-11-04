import { router } from "expo-router";
import { Text, View, TouchableOpacity } from "react-native";
import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/fetch";

import CustomButton from "@/components/CustomButton";
import LocationTextInput from "@/components/LocationTextInput";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { useLocationStore } from "@/store";

type Place={address:string,latitude:number,longitude:number,times:number};
const FindRide = () => {
  const [frequent,setFrequent]=useState<Place[]>([]);
  useEffect(()=>{fetchAPI("/api/rides/frequent-places").then(data=>{
    if(Array.isArray(data))setFrequent(data);
  }).catch(()=>{});},[]);
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
        <Text className="text-base font-JakartaSemiBold mb-3 text-may-navy">
          From
        </Text>

        <LocationTextInput
          icon={icons.target}
          initialLocation={userAddress || "Current Location"}
          containerStyle="border border-may-lavender bg-white"
          textInputBackgroundColor="#FFFFFF"
          handlePress={(location) =>
            setUserLocation(location)
          }
        />
      </View>

      <View className="my-3">
        <Text className="text-base font-JakartaSemiBold mb-3 text-may-navy">
          To
        </Text>

        <LocationTextInput
          icon={icons.map}
          initialLocation={
            destinationAddress || "Search destination"
          }
          containerStyle="border border-may-lavender bg-white"
          textInputBackgroundColor="#FFFFFF"
          handlePress={(location) =>
            setDestinationLocation(location)
          }
        />
      </View>

      {frequent.length > 0 && <View style={{marginTop:10,marginBottom:13}}>
        <Text style={{fontWeight:"800",color:"#303A7C",fontSize:16,marginBottom:9}}>Your frequent destinations</Text>
        {/* Frequent destinations as vertical cards; the parent sheet scrolls */}
        <View style={{ gap: 9 }}>
          {frequent.map((place,i)=><TouchableOpacity key={i}
            onPress={()=>setDestinationLocation({latitude:Number(place.latitude),longitude:Number(place.longitude),address:place.address})}
            style={{backgroundColor:"#EDF0FF",borderRadius:14,padding: 13, width: "100%"}}>
            <Text numberOfLines={2} style={{fontWeight:"800",color:"#303A7C"}}>{place.address}</Text>
            <Text style={{fontSize:12,marginTop:4,color:"#626A81"}}>{place.times} previous rides</Text>
          </TouchableOpacity>)}
        </View>
      </View>}
      <CustomButton
        title="Find Now"
        onPress={handleFindRide}
        className="mt-5"
      />
    </RideLayout>
  );
};

export default FindRide;