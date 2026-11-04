import { Stack } from "expo-router";
import SafetyAlertWatcher from "@/components/SafetyAlertWatcher";

const Layout = () => {
  return (
    <>
    <SafetyAlertWatcher />
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="find-ride" options={{ headerShown: false }} />
      <Stack.Screen name="wallet" options={{ headerShown: false }} />
      <Stack.Screen name="messages" options={{headerShown:false}}/>
      <Stack.Screen name="driver-history" options={{headerShown:false}}/>
      <Stack.Screen
        name="confirm-ride"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="book-ride"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
    </>
  );
};

export default Layout;
