import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
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

const SignUp = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [role, setRole] = useState<"Passenger" | "Driver">("Passenger");
  const [submitting, setSubmitting] = useState(false);

  const onSignUpPress = async () => {
    if (submitting) return;

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      Alert.alert(
        "Missing details",
        "Name, email, and password are required."
      );
      return;
    }

    if (form.password.length < 8) {
      Alert.alert(
        "Password too short",
        "Use a password with at least 8 characters."
      );
      return;
    }

    setSubmitting(true);

    try {
      const data = await fetchAPI("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phone: form.phone.trim() || undefined,
          role,
        }),
      });

      if (!data?.token || !data?.user) {
        throw new Error(
          "The server returned an incomplete registration response."
        );
      }

      setAuth(data.token, data.user);

      if (role === "Driver") {
        Alert.alert(
          "Driver application created",
          "Complete your licence and vehicle details in the Driver Dashboard. May must approve your profile before you can go online."
        );
      }

      router.replace(routeForRole(data.user.role));
    } catch (err: any) {
      Alert.alert(
        "Registration failed",
        err.message || "Please try again."
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
          <View className="relative h-[220px] w-full">
            <Image
              source={images.signUpCar}
              className="z-0 h-[220px] w-full"
              resizeMode="cover"
            />
            <Text className="absolute bottom-5 left-5 text-2xl font-JakartaSemiBold text-black">
              Create Your Account
            </Text>
          </View>

          <View className="p-5">
            <Text className="mb-3 text-base font-JakartaSemiBold text-gray-700">
              I want to join May as a
            </Text>

            <View className="mb-5 flex-row gap-3">
              {(["Passenger", "Driver"] as const).map((item) => (
                <TouchableOpacity
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: role === item }}
                  onPress={() => setRole(item)}
                  className={`flex-1 rounded-xl border p-4 ${
                    role === item
                      ? "border-primary-500 bg-blue-50"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  <Text
                    className={`text-center font-JakartaBold ${
                      role === item
                        ? "text-primary-500"
                        : "text-gray-700"
                    }`}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <InputField
              label="Name"
              placeholder="Enter full name"
              icon={icons.person}
              value={form.name}
              onChangeText={(value) =>
                setForm({ ...form, name: value })
              }
            />

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
              label="Phone (optional)"
              placeholder="Enter phone number"
              icon={icons.person}
              keyboardType="phone-pad"
              value={form.phone}
              onChangeText={(value) =>
                setForm({ ...form, phone: value })
              }
            />

            <InputField
              label="Password"
              placeholder="At least 8 characters"
              icon={icons.lock}
              secureTextEntry
              textContentType="newPassword"
              value={form.password}
              onChangeText={(value) =>
                setForm({ ...form, password: value })
              }
            />

            {role === "Driver" && (
              <Text className="mb-3 mt-2 text-sm leading-5 text-gray-600">
                Driver accounts start as Pending. You must submit your
                licence and vehicle details and be approved by May before
                going online.
              </Text>
            )}

            <CustomButton
              title={submitting ? "Creating account..." : "Create Account"}
              onPress={onSignUpPress}
              className="mt-4"
            />

            <Text
              onPress={() => router.push("/(auth)/sign-in")}
              accessibilityRole="button"
              className="mt-10 mb-5 text-center text-lg text-general-200"
            >
              Already have an account?{" "}
              <Text className="text-primary-500">Sign In</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default SignUp;
