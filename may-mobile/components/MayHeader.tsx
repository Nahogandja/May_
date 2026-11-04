import React from "react";
import { Text, View } from "react-native";
import { MAY } from "@/theme/may";

export default function MayHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ paddingTop: 12, paddingBottom: 20 }}>
      <Text style={{ fontSize: 29, fontWeight: "900", color: MAY.navy, letterSpacing: -0.7 }}>
        {title}
      </Text>
      {subtitle ? <Text style={{ color: MAY.muted, fontSize: 14, marginTop: 5, lineHeight: 21 }}>{subtitle}</Text> : null}
    </View>
  );
}
