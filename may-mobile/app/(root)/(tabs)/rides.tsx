import { ActivityIndicator, FlatList, Image, Text, View } from "react-native";
import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import RideCard from "@/components/RideCard";
import MayHeader from "@/components/MayHeader";
import { images } from "@/constants";
import { useFetch } from "@/lib/fetch";
import { Ride } from "@/types/type";

const Rides = () => {
  const {
    data: recentRides,
    loading,
    refetch,
  } = useFetch<Ride[]>("/api/rides/my-rides");

  useFocusEffect(useCallback(()=>{refetch();const timer=setInterval(()=>refetch(),12000);return()=>clearInterval(timer);},[refetch]));
  return (
    <SafeAreaView className="flex-1 bg-may-page">
      <FlatList
        data={recentRides}
        renderItem={({ item }) => (
          <RideCard ride={item} onVerified={refetch} />
        )}
        keyExtractor={(item) => String(item.id)}
        className="px-5"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingBottom: 138,
        }}
        ListEmptyComponent={() => (
          <View className="flex flex-col items-center justify-center">
            {!loading ? (
              <>
                <Image
                  source={images.noResult}
                  className="h-40 w-40"
                  resizeMode="contain"
                />
                <Text className="text-sm">No recent rides found</Text>
              </>
            ) : (
              <ActivityIndicator size="small" color="#5969C7" />
            )}
          </View>
        )}
        ListHeaderComponent={
          <MayHeader title="My rides" subtitle="Check your trips and confirm safe arrivals." />
        }
      />
    </SafeAreaView>
  );
};

export default Rides;