import { Tabs } from "expo-router";
import ExpandableNavigation from "@/components/ExpandableNavigation";
export default function Layout(){
  return <Tabs tabBar={(props)=><ExpandableNavigation {...props}/>} screenOptions={{headerShown:false}}>
    <Tabs.Screen name="home" options={{title:"Home"}}/>
    <Tabs.Screen name="rides" options={{title:"Rides"}}/>
    <Tabs.Screen name="chat" options={{title:"Messages"}}/>
    <Tabs.Screen name="profile" options={{title:"Profile"}}/>
  </Tabs>;
}
