import React, {useCallback,useEffect,useRef,useState} from "react";
import {ActivityIndicator,Alert,FlatList,KeyboardAvoidingView,Platform,Pressable,
 Text,TextInput,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect,useLocalSearchParams,router} from "expo-router";
import {fetchAPI} from "@/lib/fetch";
import {useAuthStore} from "@/store/auth";
import {MAY} from "@/theme/may";
type Conversation={ride_id:string;contact_name:string;status:string;pickup:string;dropoff:string;last_message?:string};
type Message={id:string;ride_id:string;sender_id:string;sender_name:string;body:string;created_at:string};
export default function RideMessages(){
 const params=useLocalSearchParams<{rideId?:string}>();
 const initial=typeof params.rideId==="string"?params.rideId:null;
 const myId=useAuthStore(s=>s.user?.id);
 const [active,setActive]=useState<string|null>(initial);
 const [threads,setThreads]=useState<Conversation[]>([]);
 const [messages,setMessages]=useState<Message[]>([]);
 const [text,setText]=useState("");const [sending,setSending]=useState(false);
 const [loading,setLoading]=useState(false);
 const listRef=useRef<FlatList<Message>>(null);
 const load=useCallback(async()=>{
   try {const d=await fetchAPI("/api/messages");if(Array.isArray(d))setThreads(d);}catch(error){console.warn("Conversations",error);}
 },[]);
 const loadChat=useCallback(async()=>{
   if(!active)return;
   try{const d=await fetchAPI(`/api/messages/${active}`);if(Array.isArray(d))setMessages(d);}
   catch(error){console.warn("Messages",error);}
 },[active]);
 useFocusEffect(useCallback(()=>{setLoading(true);load().finally(()=>setLoading(false));
   const timer=setInterval(()=>{load();},9000);return()=>clearInterval(timer);},[load]));
 useEffect(()=>{if(initial)setActive(initial);},[initial]);
 useEffect(()=>{loadChat();const timer=setInterval(loadChat,4000);return()=>clearInterval(timer);},[loadChat]);
 const send=async()=>{
   const body=text.trim();if(!active||!body||sending)return;
   setSending(true);
   try{await fetchAPI(`/api/messages/${active}`,{method:"POST",body:JSON.stringify({body})});
     setText("");await loadChat();await load();}
   catch(error){Alert.alert("Message not sent",error instanceof Error?error.message:"Try again");}
   finally{setSending(false);}
 };
 const conversation=threads.find(c=>c.ride_id===active);
 return <SafeAreaView style={{flex:1,backgroundColor:MAY.page}} edges={["top","bottom"]}>
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":"height"}>
   <View style={{paddingHorizontal:20,paddingTop:14,paddingBottom:12,flexDirection:"row",alignItems:"center"}}>
     {active&&<Pressable onPress={()=>{setActive(null);setMessages([]);}} style={{paddingRight:18,paddingVertical:5}}>
       <Text style={{color:MAY.purple,fontSize:18}}>‹ Back</Text></Pressable>}
     <View style={{flex:1}}><Text style={{fontWeight:"900",fontSize:23,color:MAY.navy}}>
       {active?conversation?.contact_name||"Trip conversation":"Messages"}</Text>
       <Text numberOfLines={1} style={{color:MAY.muted,fontSize:12,marginTop:3}}>
       {active?conversation?.dropoff||"Ride conversation":"Message your driver or passenger"}</Text></View>
   </View>
   {!active?<FlatList contentContainerStyle={{paddingHorizontal:15,paddingBottom:90}} data={threads}
     keyExtractor={c=>c.ride_id} ListEmptyComponent={<View style={{padding:28,alignItems:"center"}}>
       <Text style={{color:MAY.muted}}>{loading?"Loading...":"Trip conversations appear here after booking."}</Text></View>}
     renderItem={({item})=><Pressable onPress={()=>setActive(item.ride_id)}
       style={{backgroundColor:"white",borderRadius:13,padding:18,marginVertical:5,borderColor:MAY.border,borderWidth:1}}>
       <Text style={{fontSize:16,fontWeight:"800",color:MAY.navy}}>{item.contact_name}</Text>
       <Text numberOfLines={1} style={{fontSize:12,color:MAY.muted,marginTop:4}}>{item.last_message||item.dropoff}</Text>
       <Text style={{fontSize:11,color:MAY.purple,marginTop:5}}>{item.status}</Text>
     </Pressable>}/>
    :<><FlatList ref={listRef} data={messages} keyExtractor={m=>m.id}
      contentContainerStyle={{paddingHorizontal:16,paddingBottom:16,flexGrow:1,justifyContent:"flex-end"}}
      onContentSizeChange={()=>listRef.current?.scrollToEnd({animated:false})}
      ListEmptyComponent={<Text style={{textAlign:"center",color:MAY.muted,marginTop:25}}>Start the conversation.</Text>}
      renderItem={({item})=>{const mine=item.sender_id===myId;return <View style={{alignSelf:mine?"flex-end":"flex-start",maxWidth:"82%",
        borderRadius:14,backgroundColor:mine?MAY.navy:"#FFFFFF",padding:12,marginTop:9}}>
        <Text style={{color:mine?"#FFFFFF":MAY.ink,fontSize:14,lineHeight:20}}>{item.body}</Text>
        <Text style={{color:mine?"#E1DFFF":MAY.muted,fontSize:10,marginTop:4}}>
          {new Date(item.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</Text>
      </View>;}}/>
      <View style={{flexDirection:"row",alignItems:"flex-end",padding:12,backgroundColor:"#FFFFFF",gap:8}}>
        <TextInput value={text} onChangeText={setText} placeholder="Write a message" multiline
          maxLength={1200} style={{flex:1,maxHeight:110,minHeight:45,borderWidth:1,borderColor:MAY.border,
           borderRadius:13,paddingHorizontal:12,paddingVertical:10,color:MAY.ink}}/>
        <Pressable disabled={!text.trim()||sending||conversation?.status==="Completed"}
          onPress={send} style={{backgroundColor:MAY.navy,borderRadius:12,minHeight:45,paddingHorizontal:16,
           alignItems:"center",justifyContent:"center",opacity:sending?0.6:1}}>
          <Text style={{color:"white",fontWeight:"800"}}>Send</Text></Pressable>
      </View>
    </>}
   </KeyboardAvoidingView>
 </SafeAreaView>;
}
