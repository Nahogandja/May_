import {useEffect,useRef} from "react";
import {Alert} from "react-native";
import {fetchAPI} from "@/lib/fetch";
import {useAuthStore} from "@/store/auth";
export default function SafetyAlertWatcher(){
 const role=useAuthStore(s=>s.user?.role);
 const seen=useRef(new Set<string>());
 useEffect(()=>{
  if(role!=="Passenger")return;
  let active=true;
  const check=async()=>{
    try{
      const rides=await fetchAPI("/api/rides/my-rides");
      if(!active||!Array.isArray(rides))return;
      for(const ride of rides){
        const alertId=ride.safety_alert_id;
        if(!alertId||seen.current.has(alertId))continue;
        seen.current.add(alertId);
        const reason=ride.safety_alert_reason==='off_route'?'the taxi may have left its route':
          ride.safety_alert_reason==='idle'?'the taxi appears stopped during the trip':
          'the taxi may be travelling away from your destination';
        Alert.alert("Trip safety check",`We detected that ${reason}. Are you currently safe?`,[
          {text:"I need help",style:"destructive",onPress:async()=>{
            try{
              await fetchAPI(`/api/rides/safety-response/${alertId}`,{method:"POST",body:JSON.stringify({safe:false})});
              const result=await fetchAPI("/api/rides/emergency",{method:"POST",body:JSON.stringify({rideId:ride.id})});
              Alert.alert("SOS logged",`The safety team has an urgent incident. Emergency contact SMS: ${result.emergencyContactSmsStatus||'not configured'}. Call emergency services directly if in immediate danger.`);
            }catch(e){Alert.alert("Alert failed","Please contact local emergency services directly.");}
          }},
          {text:"I'm safe",onPress:async()=>{
            try{await fetchAPI(`/api/rides/safety-response/${alertId}`,{method:"POST",body:JSON.stringify({safe:true})});
              Alert.alert("Safety response received","If no emergency is active, a new Safe Arrival Code is now shown in your ride details. For unresolved incidents, the safety team will review the report.");}
            catch(e){Alert.alert("Not saved",e instanceof Error?e.message:"Try again");seen.current.delete(alertId);}
          }},
        ],{cancelable:false});
        break;
      }
    }catch(_){};
  };
  check();const timer=setInterval(check,12000);
  return()=>{active=false;clearInterval(timer);};
 },[role]);
 return null;
}
