import React,{useState} from "react";
import {ActivityIndicator,Alert,Modal,Text,TouchableOpacity,View} from "react-native";
import {fetchAPI} from "@/lib/fetch";
export default function RideCompletionPrompt({rideId,visible,onDismiss,onRated}:{
  rideId:string;visible:boolean;onDismiss:()=>void;onRated?:()=>void;
}){
 const [rating,setRating]=useState(0);
 const [saving,setSaving]=useState(false);
 const rate=async()=>{
   if(rating<1)return;
   setSaving(true);
   try{await fetchAPI(`/api/rides/rating/${rideId}`,{method:"POST",body:JSON.stringify({rating})});
     onRated?.();onDismiss();Alert.alert("Thank you","Your rating has been saved.");}
   catch(error){Alert.alert("Rating not saved",error instanceof Error?error.message:"Please try again");}
   finally{setSaving(false);}
 };
 return <Modal animationType="fade" transparent visible={visible} onRequestClose={onDismiss}>
   <View style={{flex:1,backgroundColor:"rgba(0,15,55,0.70)",justifyContent:"center",padding:22}}>
     <View style={{backgroundColor:"#FFF",borderRadius:25,padding:24,alignItems:"center"}}>
       <Text style={{fontSize:36,marginBottom:6}}>💜</Text>
       <Text style={{fontWeight:"900",color:"#303A7C",fontSize:22,textAlign:"center"}}>
         You have successfully completed the ride
       </Text>
       <Text style={{color:"#57526C",marginTop:10,textAlign:"center",fontSize:15}}>
         Would you like to rate your MAY ride?
       </Text>
       <View style={{flexDirection:"row",gap:9,marginVertical:22}}>
         {[1,2,3,4,5].map(n=><TouchableOpacity key={n} accessibilityRole="button"
           accessibilityLabel={`Rate ${n} star${n===1?'':'s'}`} onPress={()=>setRating(n)}>
           <Text style={{fontSize:32,color:n<=rating?"#B36A33":"#CFC8DF"}}>★</Text>
         </TouchableOpacity>)}
       </View>
       <TouchableOpacity disabled={!rating||saving} onPress={rate}
         style={{backgroundColor:rating?"#5969C7":"#9CA3AF",padding:15,width:"100%",borderRadius:14,alignItems:"center"}}>
         {saving?<ActivityIndicator color="white"/>:<Text style={{color:"white",fontWeight:"800"}}>Submit rating</Text>}
       </TouchableOpacity>
       <TouchableOpacity onPress={onDismiss} style={{padding:16}}>
         <Text style={{color:"#57526C",fontWeight:"700"}}>Not now</Text>
       </TouchableOpacity>
     </View>
   </View>
 </Modal>;
}
