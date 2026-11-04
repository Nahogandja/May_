import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAY } from '@/theme/may';

export default function Welcome() {
  const { height } = useWindowDimensions();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: MAY.navyDeep }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ minHeight: height - 54, flexGrow: 1,
        paddingHorizontal: 24, paddingTop: 32, paddingBottom: 25,
        justifyContent: 'space-between' }}>
        <View style={{ flex: 1, justifyContent: 'center', minHeight: 280 }}>
          <View style={{ width: 65, height: 5, borderRadius: 6,
            backgroundColor: MAY.pink, marginBottom: 28 }} />
          <Text accessibilityRole="header" adjustsFontSizeToFit numberOfLines={2}
            style={{ color: '#F4F5FF', fontSize: 35, lineHeight: 44,
              fontWeight: '900', letterSpacing: -1.3 }}>
            ES4WOMEN<Text style={{ color: MAY.pink }}>&</Text>CHILDREN
          </Text>
          <Text style={{ color: '#D2D7FF', fontSize: 18, fontWeight: '700',
            marginTop: 16, letterSpacing: 0.1 }}>
            Tailored for Women and Children
          </Text>
          <Text style={{ color: '#E1E5FC', fontSize: 15, lineHeight: 24, marginTop: 19,
            maxWidth: 370 }}>
            Book trusted rides, view verified driver details and keep loved ones informed
            throughout your journey.
          </Text>
        </View>
        <View>
          <Pressable accessibilityRole="button"
            onPress={() => router.replace('/(auth)/sign-up')}
            style={{ backgroundColor: '#D2D7FF', minHeight: 56,
              borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: MAY.navyDeep, fontSize: 17, fontWeight: '900' }}>
              Create an account  →
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            onPress={() => router.replace('/(auth)/sign-in')}
            style={{ minHeight: 58, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#E1E5FC', fontSize: 14 }}>
              Already registered? <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Sign in</Text>
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            onPress={() => router.push("/offline-booking")}
            style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#D2D7FF", fontWeight: "800", fontSize: 14 }}>
              No mobile data? Call or SMS an operator  →
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
