import { router } from "expo-router";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth";

export default function AdminComingSoon() {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  if (user?.role !== "Admin") {
    router.replace(user?.role === "Driver" ? "/(root)/driver" : "/(root)/(tabs)/home");
    return null;
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-[#F5F7FA] p-6">
      <View className="w-full rounded-3xl bg-white p-6">
        <Text className="text-xs font-bold uppercase tracking-widest text-[#64748B]">MAY ADMINISTRATION</Text>
        <Text className="mt-2 text-2xl font-extrabold text-[#14213D]">Administrator account</Text>
        <Text className="mt-3 text-base leading-6 text-[#475569]">Your account is correctly routed as an Administrator. The separate web-based Admin Dashboard is the next implementation stage.</Text>
        <TouchableOpacity onPress={() => { clearAuth(); router.replace("/(auth)/sign-in"); }} className="mt-6 rounded-xl bg-[#14213D] p-4">
          <Text className="text-center font-bold text-white">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
