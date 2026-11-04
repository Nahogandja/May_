import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MAY } from "@/theme/may";

// Use a real operator number in may-mobile/.env. Never call an invented/test number.
const rawOperatorNumber = (process.env.EXPO_PUBLIC_OPERATOR_PHONE || "").trim();
const operatorNumber = rawOperatorNumber.replace(/[\s().-]/g, "");
const numberIsConfigured = /^\+?[0-9]{7,15}$/.test(operatorNumber);

export default function OfflineBooking() {
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [departureTime, setDepartureTime] = useState("Now");
  const [passengers, setPassengers] = useState("1");

  const requireNumber = () => {
    if (numberIsConfigured) return true;
    Alert.alert("Operator number not configured", "Set EXPO_PUBLIC_OPERATOR_PHONE in may-mobile/.env to your real company contact number.");
    return false;
  };

  const callOperator = async () => {
    if (!requireNumber()) return;
    try {
      await Linking.openURL(`tel:${operatorNumber}`);
    } catch {
      Alert.alert("Phone unavailable", "Unable to open your device's phone app.");
    }
  };

  const textOperator = async () => {
    if (!requireNumber()) return;
    const message = [
      "ES4WOMEN&CHILDREN OFFLINE BOOKING REQUEST",
      `Passenger: ${name.trim() || "Please ask me"}`,
      `Pickup: ${pickup.trim() || "Please ask me"}`,
      `Destination: ${destination.trim() || "Please ask me"}`,
      `When: ${departureTime.trim() || "Now"}`,
      `Number of passengers: ${passengers.trim() || "1"}`,
      "Please confirm driver, fare and pickup details by SMS or call.",
    ].join("\n");
    const separator = Platform.OS === "ios" ? "&" : "?";
    try {
      await Linking.openURL(`sms:${operatorNumber}${separator}body=${encodeURIComponent(message)}`);
    } catch {
      Alert.alert("SMS unavailable", "Unable to open your device's messaging app.");
    }
  };

  const fields = [
    { key: "name", label: "Your name", value: name, setValue: setName, hint: "Passenger name" },
    { key: "pickup", label: "Pickup location", value: pickup, setValue: setPickup, hint: "Street, suburb or landmark" },
    { key: "destination", label: "Destination", value: destination, setValue: setDestination, hint: "Where are you going?" },
    { key: "departure", label: "When do you need a taxi?", value: departureTime, setValue: setDepartureTime, hint: "Now, in 4 hours, tomorrow..." },
    { key: "passengers", label: "Number of passengers", value: passengers, setValue: setPassengers, hint: "1" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: MAY.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 50 }}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ paddingVertical: 12, alignSelf: "flex-start" }}>
            <Text style={{ color: MAY.navy, fontSize: 16, fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text accessibilityRole="header" style={{ color: MAY.navyDeep, fontSize: 28, fontWeight: "900", marginTop: 12 }}>
            Offline booking
          </Text>
          <Text style={{ color: MAY.muted, fontSize: 15, lineHeight: 23, marginTop: 9 }}>
            Out of mobile data? Call or text our booking operator. A normal phone call or SMS does not require mobile internet.
          </Text>
          <View style={{ backgroundColor: MAY.white, borderWidth: 1, borderColor: MAY.border, borderRadius: 18, padding: 17, marginTop: 24 }}>
            <Text style={{ color: MAY.muted, fontSize: 13, fontWeight: "700" }}>ES4WOMEN&CHILDREN OPERATOR</Text>
            <Pressable onPress={callOperator} accessibilityRole="link" accessibilityLabel="Call booking operator" style={{ paddingVertical: 8 }}>
              <Text style={{ color: MAY.navy, fontSize: 23, fontWeight: "900" }}>
                {numberIsConfigured ? rawOperatorNumber : "Operator number not set"}
              </Text>
              <Text style={{ color: MAY.purple, fontSize: 13, marginTop: 5 }}>Tap to open the phone dialler</Text>
            </Pressable>
          </View>
          <Text style={{ color: MAY.navy, fontSize: 18, fontWeight: "800", marginTop: 25, marginBottom: 10 }}>
            Details for your SMS request
          </Text>
          <Text style={{ color: MAY.muted, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
            Optional. Fill these in to save time, or simply call the operator.
          </Text>
          {fields.map((field) => (
            <View key={field.key} style={{ marginBottom: 14 }}>
              <Text style={{ color: MAY.ink, fontSize: 14, fontWeight: "700", marginBottom: 7 }}>{field.label}</Text>
              <TextInput
                value={field.value}
                onChangeText={field.setValue}
                placeholder={field.hint}
                placeholderTextColor={MAY.muted}
                keyboardType={field.key === "passengers" ? "number-pad" : "default"}
                style={{ minHeight: 51, borderColor: MAY.border, borderWidth: 1, borderRadius: 13,
                  backgroundColor: MAY.white, color: MAY.ink, paddingHorizontal: 14, fontSize: 15 }}
              />
            </View>
          ))}
          <Pressable onPress={callOperator} accessibilityRole="button"
            style={{ backgroundColor: MAY.navy, borderRadius: 15, alignItems: "center", justifyContent: "center", minHeight: 56, marginTop: 12 }}>
            <Text style={{ color: MAY.white, fontSize: 16, fontWeight: "800" }}>Call operator</Text>
          </Pressable>
          <Pressable onPress={textOperator} accessibilityRole="button"
            style={{ backgroundColor: MAY.lavender, borderRadius: 15, alignItems: "center", justifyContent: "center", minHeight: 56,
              marginTop: 12, borderWidth: 1, borderColor: MAY.border }}>
            <Text style={{ color: MAY.navy, fontSize: 16, fontWeight: "800" }}>Text operator (SMS)</Text>
          </Pressable>
          <Text style={{ color: MAY.muted, lineHeight: 20, fontSize: 13, marginTop: 19 }}>
            Calls and SMS require cellular coverage. SMS fees may apply. Your booking is not confirmed until the operator responds.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
