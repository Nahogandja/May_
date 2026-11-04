import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MAY } from "@/theme/may";

/** Single keyboard-safe surface used by both Sign In and Sign Up. */
export default function MayAuthShell({ title, subtitle, children }:{
  title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: MAY.page }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: "center", marginBottom: 17, paddingTop: 8 }}>
            <Text style={{ fontSize: 23, fontWeight: "900", color: MAY.navy, letterSpacing: -0.7 }}>
              ES4WOMEN<Text style={{ color: MAY.purple }}>&</Text>CHILDREN
            </Text>
            <Text style={{ color: MAY.navy, fontSize: 13, fontWeight: "700", letterSpacing: 0.2 }}>
              Tailored for Women and Children
            </Text>
          </View>
          <View style={{ backgroundColor: MAY.white, borderRadius: 27, paddingHorizontal: 20,
            paddingTop: 20, paddingBottom: 18, borderColor: MAY.border, borderWidth: 1 }}>
            <Text style={{ color: MAY.navy, fontWeight: "900", fontSize: 26, letterSpacing: -0.5 }}>
              {title}
            </Text>
            <Text style={{ color: MAY.muted, fontSize: 14, lineHeight: 21, marginTop: 5, marginBottom: 15 }}>
              {subtitle}
            </Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
