import LocalRideReminderBridge from '../components/LocalRideReminderBridge';
import { useFonts } from "expo-font";
import { Stack, router, useRootNavigationState, useSegments } from "expo-router";
import { useAuthStore } from "@/store/auth";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const hydrated = useAuthStore(state=>state._hasHydrated);
  const signedIn = useAuthStore(state=>state.isSignedIn && !!state.token && !!state.user);
  const role = useAuthStore(state=>state.user?.role);
  useEffect(()=>{
    if(!navigationState?.key || !hydrated) return;
    const group=segments[0];
    // The offline booking screen is public, including when the device has no data.
    // Its tel: and sms: actions must not require a login or a backend request.
    if(!signedIn && group!=="(auth)" && group!=="offline-booking") router.replace("/(auth)/welcome");
    if(signedIn && (group==="(auth)" || !group)) {
      router.replace(role==="Admin"?"/admin":role==="Driver"?"/(root)/driver":"/(root)/(tabs)/home");
    }
  },[navigationState?.key,hydrated,signedIn,role,segments]);
  const [loaded] = useFonts({
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    "Jakarta-ExtraBold": require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    "Jakarta-ExtraLight": require("../assets/fonts/PlusJakartaSans-ExtraLight.ttf"),
    "Jakarta-Light": require("../assets/fonts/PlusJakartaSans-Light.ttf"),
    "Jakarta-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    Jakarta: require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded || !hydrated) return null;

  return (
    <>
            <LocalRideReminderBridge />
      <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="offline-booking" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(root)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
    </>
  );
}