import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import React, { useRef } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import Map from "@/components/Map";
import SOSButton from "@/components/SOSButton";
import { icons } from "@/constants";

const RideLayout = ({
  title,
  snapPoints,
  children,
  sosRideId,
  sosFallbackLatitude,
  sosFallbackLongitude,
}: {
  title: string;
  snapPoints?: string[];
  children: React.ReactNode;
  sosRideId?: string;
  sosFallbackLatitude?: number | null;
  sosFallbackLongitude?: number | null;
}) => {
  const bottomSheetRef = useRef<BottomSheet>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
        <View style={{ flex: 1, backgroundColor: "#657BD8" }}>
          <View
            style={{
              position: "absolute",
              zIndex: 10,
              top: 56,
              left: 0,
              right: 0,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={icons.backArrow}
                  resizeMode="contain"
                  style={{ width: 24, height: 24 }}
                />
              </View>
            </TouchableOpacity>

            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                marginLeft: 20,
                color: "#333B58",
              }}
              numberOfLines={1}
            >
              {title || "Go Back"}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Map />
          </View>
        </View>

        <BottomSheet
          ref={bottomSheetRef}
          snapPoints={snapPoints ?? ["40%", "85%"]}
          index={0}
          enableDynamicSizing={false}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {sosRideId ? (
              <SOSButton
                rideId={sosRideId}
                fallbackLatitude={sosFallbackLatitude}
                fallbackLongitude={sosFallbackLongitude}
                compact
              />
            ) : null}
            {children}
          </BottomSheetScrollView>
        </BottomSheet>
      </View>
    </GestureHandlerRootView>
  );
};

export default RideLayout;