"use strict";
const { passengerSeatsUsed } = require('./sharing');

async function getBookingState(client, driverId) {
  const result=await client.query(`SELECT seat_capacity,vetting_status
    FROM drivers WHERE user_id=$1 FOR UPDATE`,[driverId]);
  const driver=result.rows[0];
  if(!driver)return {canAccept:false,reason:'Driver not found',hasRides:false};
  const {rows: rides}=await client.query(`SELECT id,status,booking_mode,shared_trip_id,
    driver_finished,emergency_flag,safety_status,scheduled_for
    FROM rides WHERE driver_id=$1 AND status IN ('Pending','Active')`,[driverId]);
  const current=rides.filter(r=>!r.scheduled_for ||
    new Date(r.scheduled_for).getTime() <= Date.now()+15*60000);
  if(driver.vetting_status!=='Approved')
    return {canAccept:false,reason:'Driver is not approved',hasRides:current.length>0};
  if(!current.length)return {canAccept:true,hasRides:false};
  if(current.some(r=>r.emergency_flag ||
      r.safety_status && r.safety_status!=='Normal'))
    return {canAccept:false,reason:'Safety review in progress',hasRides:true};
  if(current.some(r=>r.booking_mode!=='Sharing'))
    return {canAccept:false,reason:'Solo ride in progress',hasRides:true};
  const groups=new Set(current.map(r=>r.shared_trip_id));
  if(groups.size!==1 || groups.has(null))
    return {canAccept:false,reason:'Incompatible shared groups',hasRides:true};
  if(!current.some(r=>r.status==='Pending'||r.status==='Active'&&!r.driver_finished))
    return {canAccept:false,reason:'Awaiting passenger arrival confirmation',hasRides:true};
  const used=passengerSeatsUsed(current);
  const capacity=Number(driver.seat_capacity);
  return {canAccept:used < capacity,seatsRemaining:Math.max(0,capacity-used),
    reason:used>=capacity?'All seats reserved':null,hasRides:true};
}

// Call inside the caller's SQL transaction, after locking the driver first.
async function syncDriverAvailability(client,driverId) {
  const state=await getBookingState(client,driverId);
  await client.query(`UPDATE drivers SET is_available=$2 WHERE user_id=$1`,
    [driverId,state.canAccept]);
  return state;
}
module.exports={getBookingState,syncDriverAvailability};
