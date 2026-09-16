import { Redirect } from "expo-router";

import { useAuthStore } from "@/store/auth";

export default function Index() {
  const isSignedIn = useAuthStore((state) => state.isSignedIn);

  if (isSignedIn) return <Redirect href="/(root)/(tabs)/home" />;
  return <Redirect href="/(auth)/welcome" />;
}
