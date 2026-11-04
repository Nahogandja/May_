import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import CustomButton from '@/components/CustomButton';
import MayAuthShell from '@/components/MayAuthShell';
import { fetchAPI } from '@/lib/fetch';
import { useAuthStore } from '@/store/auth';
import { MAY } from '@/theme/may';

const routeForRole = (role?: string) => role === 'Driver' ? '/(root)/driver' as const :
  role === 'Admin' ? '/admin' as const : '/(root)/(tabs)/home' as const;

type Form = { name: string; email: string; phone: string; password: string;
  emergencyContactName: string; emergencyContactPhone: string };

type FieldProps = {
  label: string; value: string; onChangeText: (value: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean; autoCapitalize?: 'none' | 'words' | 'sentences';
};
function CompactField({ label, value, onChangeText, placeholder, keyboardType = 'default',
  secureTextEntry, autoCapitalize }: FieldProps) {
  return <View style={{ flex: 1, minWidth: 0 }}>
    <Text style={{ color: MAY.ink, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
      placeholder={placeholder} placeholderTextColor="#8991A8" keyboardType={keyboardType}
      autoCapitalize={autoCapitalize || 'none'} autoCorrect={false}
      secureTextEntry={secureTextEntry}
      style={{ height: 47, color: MAY.ink, fontSize: 13, backgroundColor: MAY.page,
        paddingHorizontal: 11, borderWidth: 1, borderColor: MAY.border, borderRadius: 12 }} />
  </View>;
}

export default function SignUp() {
  const setAuth = useAuthStore(s => s.setAuth);
  const { width } = useWindowDimensions();
  const twoColumns = width >= 360;
  const [form, setForm] = useState<Form>({ name: '', email: '', password: '', phone: '',
    emergencyContactName: '', emergencyContactPhone: '' });
  const [role, setRole] = useState<'Passenger' | 'Driver'>('Passenger');
  const [gender, setGender] = useState('Female');
  const [submitting, setSubmitting] = useState(false);
  const update = (field: keyof Form) => (value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const submit = async () => {
    if (submitting) return;
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      Alert.alert('Missing details', 'Full name, email and password are required.'); return;
    }
    if (!/^\+?[0-9][0-9 +()\-]{6,20}$/.test(form.phone.trim())) {
      Alert.alert('Phone number required', 'Enter a valid contact number for ride updates and reminders.'); return;
    }
    if (form.password.length < 8) {
      Alert.alert('Password too short', 'Use at least eight characters.'); return;
    }
    if (!form.emergencyContactName.trim() ||
      !/^\+?[0-9][0-9 +()\-]{6,20}$/.test(form.emergencyContactPhone.trim())) {
      Alert.alert('Trusted contact', 'Enter your trusted contact’s name and valid phone number.'); return;
    }
    setSubmitting(true);
    try {
      const data = await fetchAPI('/api/auth/register', { method: 'POST',
        body: JSON.stringify({ name: form.name.trim(),
          email: form.email.trim().toLowerCase(), password: form.password,
          phone: form.phone.trim(), role,
          emergencyContactName: form.emergencyContactName.trim(),
          emergencyContactPhone: form.emergencyContactPhone.trim(),
          ...(role === 'Driver' ? { gender } : {}) }) });
      if (!data?.token || !data?.user) throw new Error('Incomplete registration response.');
      setAuth(data.token, data.user);
      if (role === 'Driver') Alert.alert('Driver application created',
        'Complete your licence, vehicle and identity details before approval.');
      router.replace(routeForRole(data.user.role));
    } catch (e: any) {
      Alert.alert('Registration failed', e.message || 'Please try again.');
    } finally { setSubmitting(false); }
  };

  return <MayAuthShell title="Create your account" subtitle="A few details to help make every ride safer.">
    <Text style={{ color: MAY.ink, fontWeight: '800', fontSize: 13, marginBottom: 8 }}>Account type</Text>
    <View style={{ flexDirection: 'row', gap: 9, marginBottom: 15 }}>
      {(['Passenger', 'Driver'] as const).map(option =>
        <TouchableOpacity key={option} accessibilityRole="button"
          accessibilityState={{ selected: role === option }} onPress={() => setRole(option)}
          style={{ flex: 1, borderRadius: 12, paddingVertical: 11, borderWidth: 1.5,
            borderColor: role === option ? MAY.purple : MAY.border,
            backgroundColor: role === option ? MAY.lavender : MAY.white }}>
          <Text style={{ textAlign: 'center', color: MAY.navy, fontWeight: '800' }}>{option}</Text>
        </TouchableOpacity>)}
    </View>

    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 10 }}>
        <CompactField label="Full name" placeholder="First and last name" value={form.name}
          autoCapitalize="words" onChangeText={update('name')} />
        <CompactField label="Email address" placeholder="you@example.com" value={form.email}
          keyboardType="email-address" onChangeText={update('email')} />
      </View>
      <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 10 }}>
        <CompactField label="Phone number (required)" placeholder="+264 ..." value={form.phone}
          keyboardType="phone-pad" onChangeText={update('phone')} />
        <CompactField label="Password" placeholder="8+ characters" value={form.password}
          secureTextEntry onChangeText={update('password')} />
      </View>
    </View>

    <View style={{ borderTopWidth: 1, borderTopColor: MAY.border, marginTop: 16,
      paddingTop: 13, marginBottom: 13 }}>
      <Text style={{ color: MAY.navy, fontWeight: '900', fontSize: 15, marginBottom: 3 }}>
        Trusted emergency contact
      </Text>
      <Text style={{ color: MAY.muted, fontSize: 12, marginBottom: 10 }}>
        The person you want contacted about safety incidents.
      </Text>
      <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 10 }}>
        <CompactField label="Contact full name" placeholder="Full name"
          value={form.emergencyContactName} autoCapitalize="words"
          onChangeText={update('emergencyContactName')} />
        <CompactField label="Contact number" placeholder="+264 ..."
          keyboardType="phone-pad" value={form.emergencyContactPhone}
          onChangeText={update('emergencyContactPhone')} />
      </View>
    </View>

    {role === 'Driver' && <View style={{ marginBottom: 12 }}>
      <Text style={{ color: MAY.ink, fontWeight: '800', fontSize: 12, marginBottom: 8 }}>
        Gender shown in driver profile
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {['Female', 'Male', 'Other', 'Prefer not to say'].map(option =>
          <TouchableOpacity key={option} onPress={() => setGender(option)}
            style={{ paddingHorizontal: 9, paddingVertical: 8, borderRadius: 9, borderWidth: 1,
              borderColor: gender === option ? MAY.purple : MAY.border,
              backgroundColor: gender === option ? MAY.lavender : MAY.white }}>
            <Text style={{ color: MAY.ink, fontSize: 12, fontWeight: '700' }}>{option}</Text>
          </TouchableOpacity>)}
      </View>
    </View>}
    <CustomButton title={submitting ? 'Creating account…' : 'Create account'}
      onPress={submit} disabled={submitting} />
    <TouchableOpacity accessibilityRole="button"
      onPress={() => router.push('/(auth)/sign-in')} style={{ paddingVertical: 14 }}>
      <Text style={{ textAlign: 'center', color: MAY.muted, fontSize: 13 }}>
        Already have an account? <Text style={{ color: MAY.purple, fontWeight: '900' }}>Sign in</Text>
      </Text>
    </TouchableOpacity>
  </MayAuthShell>;
}
