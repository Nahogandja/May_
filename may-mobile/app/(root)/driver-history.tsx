import React,{useCallback,useState} from "react";
import {router,useFocusEffect} from "expo-router";
import {ActivityIndicator,FlatList,Pressable,Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {fetchAPI} from "@/lib/fetch";
import {MAY} from "@/theme/may";
type Entry={id:string;passenger_name?:string;pickup?:string;dropoff?:string;
 booking_mode?:string;fare?:number;status?:string;created_at?:string;scheduled_for?:string};
export default function DriverHistory(){
 const [rides,setRides]=useState<Entry[]>([]);const [loading,setLoading]=useState(true);
 const refresh=useCallback(()=>{setLoading(true);fetchAPI("/api/driver/rides")
  .then(x=>setRides((Array.isArray(x)?x:Array.isArray(x?.data)?x.data:[]).filter((r: Entry)=>["completed","cancelled","canceled"].includes((r.status||"").toLowerCase()))))
  .catch(()=>setRides([])).finally(()=>setLoading(false));},[]);
 useFocusEffect(useCallback(()=>{refresh();},[refresh]));
 return <SafeAreaView style={{flex:1,backgroundColor:MAY.page}}>
   <View style={{paddingHorizontal:20,paddingVertical:14,flexDirection:"row",alignItems:"center",gap:14}}>
    <Pressable onPress={()=>router.back()} style={{padding:8}}><Text style={{fontSize:23,color:MAY.purple}}>‹</Text></Pressable>
    <Text style={{fontSize:23,fontWeight:"900",color:MAY.navy}}>Ride history</Text>
   </View>
   {loading&&<ActivityIndicator color={MAY.purple}/>}
   <FlatList contentContainerStyle={{paddingHorizontal:18,paddingBottom:40}} data={rides}
    keyExtractor={r=>r.id} ListEmptyComponent={!loading?<Text style={{color:MAY.muted,textAlign:"center",marginTop:60}}>No completed or cancelled rides yet.</Text>:null}
    renderItem={({item})=><View style={{backgroundColor:"white",marginVertical:6,padding:17,borderRadius:14,borderWidth:1,borderColor:MAY.border}}>
      <View style={{flexDirection:"row",justifyContent:"space-between",gap:8}}>
        <Text style={{fontSize:16,fontWeight:"800",color:MAY.navy,flex:1}}>{item.passenger_name||"Passenger"}</Text>
        <Text style={{color:item.status?.toLowerCase()==="completed"?MAY.success:MAY.muted}}>{item.status}</Text>
      </View>
      <Text style={{color:MAY.ink,marginTop:7}}>{item.pickup} → {item.dropoff}</Text>
      <Text style={{color:MAY.muted,marginTop:8,fontSize:12}}>
        {item.booking_mode} · N${item.fare ?? 0} · {item.created_at?new Date(item.created_at).toLocaleString():""}</Text>
    </View>}/>
 </SafeAreaView>;
}
