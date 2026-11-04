import React, { useState } from "react";
import { Image, Text, TextInput, View } from "react-native";
import { InputFieldProps } from "@/types/type";
import { MAY } from "@/theme/may";

/** Form field is deliberately not a KeyboardAvoidingView: the page owns keyboard avoidance. */
export default function InputField({
  label, icon, secureTextEntry = false, labelStyle, containerStyle,
  inputStyle, iconStyle, className, style, ...props
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View className={`mb-4 w-full ${className ?? ""}`}>
      <Text className={`mb-2 text-sm font-JakartaSemiBold ${labelStyle ?? ""}`} style={{ color: MAY.ink }}>
        {label}
      </Text>
      <View className={`min-h-14 flex-row items-center rounded-2xl border px-4 ${containerStyle ?? ""}`}
        style={{ backgroundColor: MAY.white, borderColor: focused ? MAY.purple : MAY.border, borderWidth: focused ? 2 : 1 }}>
        {icon ? <Image source={icon} className={`mr-3 h-5 w-5 ${iconStyle ?? ""}`} resizeMode="contain" /> : null}
        <TextInput
          {...props}
          secureTextEntry={secureTextEntry}
          placeholderTextColor={MAY.muted}
          selectionColor={MAY.purple}
          onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
          className={`min-w-0 flex-1 py-3 text-base font-JakartaMedium ${inputStyle ?? ""}`}
          style={[{ color: MAY.ink, minHeight: 50 }, style]}
        />
      </View>
    </View>
  );
}
