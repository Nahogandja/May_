import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";

import CustomButton from "@/components/CustomButton";
import InputField from "@/components/InputField";
import { icons, images } from "@/constants";
import { fetchAPI } from "@/lib/fetch";
import { useAuthStore } from "@/store/auth";

const routeForRole = (role?: string) => {
  if (role === "Driver") return "/(root)/driver" as const;
  if (role === "Admin") return "/admin" as const;
  return "/(root)/(tabs)/home" as const;
};

const SignIn = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const onSignInPress = async () => {
    if (submitting) return;

    if (!form.email.trim() || !form.password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }

    setSubmitting(true);

    try {
      const data = await fetchAPI("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });

      if (!data?.token || !data?.user) {
        throw new Error("The server returned an incomplete login response.");
      }

      setAuth(data.token, data.user);
      router.replace(routeForRole(data.user.role));
    } catch (err: any) {
      Alert.alert(
        "Sign in failed",
        err.message || "Please check your details and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 60,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 bg-white">
          <View className="relative h-[250px] w-full">
            <Image
              source={images.signUpCar}
              className="z-0 h-[250px] w-full"
              resizeMode="cover"
            />
            <Text className="absolute bottom-5 left-5 text-2xl font-JakartaSemiBold text-black">
              Welcome
            </Text>
          </View>

          <View className="p-5">
            <InputField
              label="Email"
              placeholder="Enter email"
              icon={icons.email}
              textContentType="emailAddress"
              value={form.email}
              onChangeText={(value) =>
                setForm({ ...form, email: value })
              }
            />

            <InputField
              label="Password"
              placeholder="Enter password"
              icon={icons.lock}
              secureTextEntry
              textContentType="password"
              value={form.password}
              onChangeText={(value) =>
                setForm({ ...form, password: value })
              }
            />

            <CustomButton
              title={submitting ? "Signing in..." : "Sign In"}
              onPress={onSignInPress}
              className="mt-6"
            />

            <Text
              onPress={() => router.push("/(auth)/sign-up")}
              accessibilityRole="button"
              className="mt-10 mb-5 text-center text-lg text-general-200"
            >
              Don't have an account?{" "}
              <Text className="text-primary-500">Sign Up</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default SignIn;
