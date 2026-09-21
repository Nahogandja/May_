import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "@/store/auth";

export default function Index() {
  const isSignedIn = useAuthStore((state) => state.isSignedIn);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  // Wait until SecureStore has finished loading the saved auth state
  if (!hasHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0286FF" />
      </View>
    );
  }

  if (isSignedIn) return <Redirect href="/(root)/(tabs)/home" />;
  return <Redirect href="/(auth)/welcome" />;
}