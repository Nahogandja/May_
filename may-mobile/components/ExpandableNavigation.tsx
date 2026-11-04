import React, {useState} from "react";
import {Image, Pressable, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {icons} from "@/constants";
import {MAY} from "@/theme/may";
const items:Record<string,{label:string,icon:any}>={
  home:{label:"Home",icon:icons.home},rides:{label:"Rides",icon:icons.list},
  chat:{label:"Messages",icon:icons.chat},profile:{label:"Profile",icon:icons.profile}
};
export default function ExpandableNavigation({state,navigation}:any){
  const [open,setOpen]=useState(false);
  const insets=useSafeAreaInsets();
  return <View pointerEvents="box-none" style={{position:"absolute",right:16,bottom:Math.max(20,insets.bottom+10),alignItems:"flex-end"}}>
    {open&&<View style={{backgroundColor:"#FFFFFF",borderRadius:16,padding:8,marginBottom:10,
       borderColor:MAY.border,borderWidth:1,elevation:8,minWidth:174}}>
      {state.routes.filter((r:any)=>items[r.name]).map((route:any)=>{
        const item=items[route.name];const selected=route.key===state.routes[state.index]?.key;
        return <Pressable key={route.key} accessibilityRole="button" onPress={()=>{
          const event=navigation.emit({type:"tabPress",target:route.key,canPreventDefault:true});
          if(!event.defaultPrevented)navigation.navigate(route.name);setOpen(false);
        }} style={{flexDirection:"row",alignItems:"center",paddingHorizontal:12,minHeight:49,
          backgroundColor:selected?MAY.lavender:"#FFFFFF",borderRadius:10}}>
          <Image source={item.icon} style={{height:18,width:18,tintColor:selected?MAY.purple:MAY.navy,marginRight:12}} />
          <Text style={{fontSize:15,fontWeight:selected?"800":"600",color:MAY.navy}}>{item.label}</Text>
        </Pressable>;
      })}
    </View>}
    <Pressable onPress={()=>setOpen(x=>!x)} accessibilityRole="button"
      accessibilityLabel={open?"Close navigation":"Open navigation"}
      style={{height:58,width:58,borderRadius:18,backgroundColor:MAY.navy,
        alignItems:"center",justifyContent:"center",elevation:7}}>
      {open?<Text style={{color:"white",fontSize:28,lineHeight:32}}>×</Text>:
        <View style={{gap:5}}>{[0,1,2].map(x=><View key={x}
          style={{height:3,width:23,backgroundColor:MAY.pink,borderRadius:2}}/>)}</View>}
    </Pressable>
  </View>;
}
