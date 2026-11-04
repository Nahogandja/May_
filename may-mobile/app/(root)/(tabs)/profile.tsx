import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, TextInput } from "react-native";
import { fetchAPI } from "@/lib/fetch";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MayHeader from "@/components/MayHeader";
import { useAuthStore } from "@/store/auth";
import { MAY } from "@/theme/may";
export default function Profile() {
  const user = useAuthStore((s)=>s.user);
  const clearAuth = useAuthStore((s)=>s.clearAuth);
  const [phone,setPhone]=useState("");
  const [phoneSaving,setPhoneSaving]=useState(false);
  const [contactName,setContactName]=useState("");
  const [contactPhone,setContactPhone]=useState("");
  const [contactSaving,setContactSaving]=useState(false);
  useEffect(()=>{fetchAPI("/api/auth/safety-profile").then((result)=>{
    setPhone(result?.profile?.phone || "");
    setContactName(result?.profile?.emergency_contact_name || "");
    setContactPhone(result?.profile?.emergency_contact_phone || "");
  }).catch(()=>{});},[]);
  const saveContact=async()=>{
    setContactSaving(true);
    try {await fetchAPI("/api/auth/emergency-contact",{method:"PATCH",body:JSON.stringify({
      emergencyContactName:contactName,emergencyContactPhone:contactPhone
    })});Alert.alert("Saved","Your emergency contact was updated.");}
    catch(error){Alert.alert("Could not save",error instanceof Error?error.message:"Try again.");}
    finally{setContactSaving(false);}
  };
  const savePhone=async()=>{
    if (!/^\+?[0-9][0-9 +()\-]{6,20}$/.test(phone.trim())) {
      Alert.alert("Phone required", "Enter a valid phone number."); return;
    }
    setPhoneSaving(true);
    try { await fetchAPI("/api/auth/phone",{method:"PATCH",body:JSON.stringify({phone:phone.trim()})});
      Alert.alert("Saved", "Your phone number was updated for ride reminders."); }
    catch(error){Alert.alert("Could not save",error instanceof Error?error.message:"Try again.");}
    finally{setPhoneSaving(false);}
  };
  const fields = [["Name",user?.name],["Email",user?.email],["Account type",user?.role]];
  return (
    <SafeAreaView style={{flex:1,backgroundColor:MAY.page}} edges={["top"]}>
      <ScrollView contentContainerStyle={{paddingHorizontal:20,paddingBottom:140}}>
        <MayHeader title="My profile" subtitle="Account details and settings" />
        <View style={{backgroundColor:MAY.white,borderWidth:1,borderColor:MAY.border,
          borderRadius:24,paddingHorizontal:20,paddingVertical:10}}>
          {fields.map(([label,value],i) => <View key={label} style={{paddingVertical:17,
            borderBottomWidth:i===fields.length-1?0:1,borderBottomColor:MAY.border}}>
            <Text style={{color:MAY.muted,fontSize:12,fontWeight:"700"}}>{label}</Text>
            <Text selectable style={{color:MAY.navy,fontSize:16,fontWeight:"700",marginTop:5}}>{value || "Not available"}</Text>
          </View>)}
        </View>
        <View style={{backgroundColor:MAY.white,borderRadius:20,padding:17,marginTop:17,borderWidth:1,borderColor:MAY.border}}>
          <Text style={{color:MAY.navy,fontWeight:"900",fontSize:18,marginBottom:8}}>My phone number (required)</Text>
          <TextInput accessibilityLabel="Your phone number" placeholder="+264 ..." keyboardType="phone-pad"
            value={phone} onChangeText={setPhone} style={{borderWidth:1,borderColor:MAY.border,borderRadius:12,padding:13,marginBottom:10,color:MAY.navy}}/>
          <TouchableOpacity disabled={phoneSaving} onPress={savePhone}
            style={{backgroundColor:MAY.purple,padding:14,borderRadius:12,alignItems:"center"}}>
            <Text style={{color:"white",fontWeight:"800"}}>{phoneSaving?"Saving...":"Save phone number"}</Text>
          </TouchableOpacity>
        </View>
        <View style={{backgroundColor:MAY.white,borderRadius:20,padding:17,marginTop:17,borderWidth:1,borderColor:MAY.border}}>
          <Text style={{color:MAY.navy,fontWeight:"900",fontSize:18,marginBottom:8}}>Emergency contact</Text>
          <Text style={{color:MAY.muted,fontSize:12,marginBottom:10}}>This person may be contacted during an ES4WAC safety incident.</Text>
          <TextInput accessibilityLabel="Emergency contact name" placeholder="Contact name" value={contactName}
            onChangeText={setContactName} style={{borderWidth:1,borderColor:MAY.border,borderRadius:12,padding:13,marginBottom:10,color:MAY.navy}}/>
          <TextInput accessibilityLabel="Emergency contact phone" placeholder="+264 ..." keyboardType="phone-pad"
            value={contactPhone} onChangeText={setContactPhone} style={{borderWidth:1,borderColor:MAY.border,borderRadius:12,padding:13,marginBottom:10,color:MAY.navy}}/>
          <TouchableOpacity disabled={contactSaving} onPress={saveContact}
            style={{backgroundColor:MAY.purple,padding:14,borderRadius:12,alignItems:"center"}}>
            <Text style={{color:"white",fontWeight:"800"}}>{contactSaving?"Saving...":"Save emergency contact"}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={()=>router.push("/(root)/wallet")}
          style={{minHeight:58,backgroundColor:MAY.lavender,borderRadius:17,marginTop:20,
            paddingHorizontal:17,justifyContent:"center"}}>
          <Text style={{color:MAY.purple,fontWeight:"800",fontSize:15}}>ES4WAC Wallet  →</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={()=>{clearAuth();router.replace("/(auth)/welcome");}}
          style={{minHeight:55,backgroundColor:MAY.navy,borderRadius:17,marginTop:14,
            alignItems:"center",justifyContent:"center"}}>
          <Text style={{color:MAY.white,fontWeight:"800"}}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
