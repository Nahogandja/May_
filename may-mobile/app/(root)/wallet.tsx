import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchAPI } from "@/lib/fetch";
import { useAuthStore } from "@/store/auth";

type WalletTransaction = {
  id: string;
  ride_id: string | null;
  entry_type: "demo_topup" | "ride_payment" | "ride_refund" | "driver_earning";
  amountCents: number;
  channel: string | null;
  description: string | null;
  created_at: string;
};
type WalletData = {
  balanceCents: number;
  currency: "NAD";
  demo: true;
  role: string;
  transactions: WalletTransaction[];
};

const money = (amountCents: number) => `N$${(amountCents / 100).toFixed(2)}`;
const titles: Record<WalletTransaction["entry_type"], string> = {
  demo_topup: "Test credit top-up",
  ride_payment: "Ride payment",
  ride_refund: "Ride cancellation refund",
  driver_earning: "Driver trip earning",
};

export default function WalletScreen() {
  const role = useAuthStore((state) => state.user?.role);
  const isDriver = role === "Driver";
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<"MoMo" | "Card">("MoMo");

  const load = useCallback(async () => {
    try {
      const result = (await fetchAPI("/api/wallet")) as WalletData;
      setWallet(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load wallet");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const topUp = (amount: number) => {
    if (busy || isDriver) return;
    Alert.alert(
      "SIMULATED payment",
      `Add N$${amount} test credits using ${channel}? This does NOT transfer real money.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add test credits", onPress: async () => {
          setBusy(true);
          try {
            await fetchAPI("/api/wallet/demo-topup", {
              method: "POST",
              body: JSON.stringify({ amount, channel }),
            });
            await load();
            Alert.alert("Test top-up successful", `N$${amount} in simulated funds added.`);
          } catch (e) {
            Alert.alert("Top-up failed", e instanceof Error ? e.message : "Try again");
          } finally {
            setBusy(false);
          }
        } },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F8FC]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          load();
        }} />}
      >
        <TouchableOpacity onPress={() => router.back()} className="mb-4 py-2">
          <Text className="font-semibold text-[#5969C7]">{"← Back"}</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-extrabold text-[#303A7C]">
          {isDriver ? "ES4WAC Driver Earnings" : "ES4WAC Wallet"}
        </Text>
        <View className="mt-3 rounded-xl bg-[#FEF3C7] p-3">
          <Text className="font-bold text-[#916332]">Wallet overview</Text>
          <Text className="mt-1 text-sm text-[#916332]">
            All wallet money, MoMo, card payments and driver earnings are simulated. No real payments or payouts occur.
          </Text>
        </View>

        <View className="mt-5 rounded-3xl bg-[#303A7C] p-6">
          <Text className="text-sm font-semibold text-[#DDE2FC]">
            {isDriver ? "Earnings balance" : "Available balance"}
          </Text>
          {loading && !wallet ? (
            <ActivityIndicator className="mt-3" color="#FFFFFF" />
          ) : (
            <Text className="mt-2 text-4xl font-extrabold text-white">
              {money(wallet?.balanceCents ?? 0)}
            </Text>
          )}
          <Text className="mt-3 text-xs text-[#DDE2FC]">
            {isDriver ? "Credited after passenger Safe Arrival" : "Sharing N$15  ·  Solo N$30"}
          </Text>
        </View>

        {error ? (
          <View className="mt-4 rounded-xl bg-[#FFF1E3] p-4">
            <Text className="text-[#A65C32]">{error}</Text>
            <TouchableOpacity onPress={load} className="mt-2">
              <Text className="font-bold text-[#A65C32]">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isDriver ? (
          <View className="mt-6">
            <Text className="text-lg font-bold text-[#303A7C]">Test credit top-up</Text>
            <Text className="mt-1 text-sm text-[#626A81]">Choose a payment method. No phone number or card details required.</Text>
            <View className="mt-3 flex-row" style={{ gap: 10 }}>
              {(["MoMo", "Card"] as const).map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setChannel(item)}
                  className={`flex-1 items-center rounded-xl border p-4 ${channel === item ? "border-[#5969C7] bg-[#EDF0FF]" : "border-[#DFE3F3] bg-white"}`}
                >
                  <Text className="font-bold text-[#303A7C]">{item === "MoMo" ? "MTC MoMo" : "Card"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="mt-3 flex-row flex-wrap justify-between">
              {[50, 100, 200, 500].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  disabled={busy}
                  onPress={() => topUp(amount)}
                  style={{ width: "48%" }}
                  className={`mb-3 items-center rounded-xl bg-[#5969C7] p-4 ${busy ? "opacity-50" : ""}`}
                >
                  <Text className="font-bold text-white">Add N${amount}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mt-5">
          <Text className="mb-3 text-lg font-bold text-[#303A7C]">Transaction history</Text>
          {!wallet?.transactions?.length ? (
            <View className="rounded-xl bg-white p-5">
              <Text className="text-[#626A81]">No transactions yet.</Text>
            </View>
          ) : wallet.transactions.map((tx) => (
            <View key={tx.id} className="mb-2 flex-row items-center justify-between rounded-xl bg-white p-4">
              <View className="flex-1 pr-4">
                <Text className="font-bold text-[#303A7C]">{titles[tx.entry_type] || tx.entry_type}</Text>
                <Text className="mt-1 text-xs text-[#626A81]">
                  {tx.channel ? `${tx.channel} · ` : ""}{new Date(tx.created_at).toLocaleString()}
                </Text>
              </View>
              <Text className={`font-extrabold ${tx.amountCents < 0 ? "text-[#A65C32]" : "text-[#5969C7]"}`}>
                {tx.amountCents < 0 ? "−" : "+"}{money(Math.abs(tx.amountCents))}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
