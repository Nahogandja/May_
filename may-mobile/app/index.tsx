import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/auth";

export default function Index() {
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const isSignedIn = useAuthStore((state) => state.isSignedIn);
  const user = useAuthStore((state) => state.user);

  if (!hasHydrated) {
    return null;
  }

  if (isSignedIn && user) {
    if (user.role === "Admin") {
      return <Redirect href="/admin" />;
    }

    if (user.role === "Driver") {
      return <Redirect href="/(root)/driver" />;
    }

    return <Redirect href="/(root)/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}