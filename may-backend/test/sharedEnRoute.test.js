'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { eligibleForBooking, passengerSeatsUsed, compatibleWithMovingSharedRide } = require('../src/services/sharing');

const driver = {vetting_status:'Approved',is_available:true,vehicle_category:'Standard',
 seat_capacity:4,current_lat:-22.5640,current_lng:17.0730};
const route = [[17.065,-22.56],[17.073,-22.564],[17.085,-22.570],[17.102,-22.58]];
const ride = {status:'Active',booking_mode:'Sharing',shared_trip_id:'group-A',
  driver_finished:false,emergency_flag:false,safety_status:'Normal',scheduled_for:null,
  planned_route:route,pickup_lat:-22.560,pickup_lng:17.065,
  dropoff_lat:-22.580,dropoff_lng:17.102};
const requested={pickupLat:-22.570,pickupLng:17.085,
 dropoffLat:-22.579,dropoffLng:17.101};

test('Active shared ride can accept an onward passenger with seats available',()=>{
 assert.equal(compatibleWithMovingSharedRide(ride,requested,driver),true);
 assert.equal(eligibleForBooking({driver,unfinished:[ride],mode:'Sharing',requested}),true);
});
test('Driver does not accept backwards pickups',()=>{
 const behind={...requested,pickupLat:-22.560,pickupLng:17.065};
 assert.equal(eligibleForBooking({driver,unfinished:[ride],mode:'Sharing',requested:behind}),false);
});
test('Driver refuses off-route pickups',()=>{
 const offRoute={...requested,pickupLat:-22.630,pickupLng:17.20};
 assert.equal(eligibleForBooking({driver,unfinished:[ride],mode:'Sharing',requested:offRoute}),false);
});
test('No solo bookings can join an active sharing group',()=>{
 assert.equal(eligibleForBooking({driver,unfinished:[ride],mode:'Solo',requested}),false);
});
test('Capacity counts assigned or onboard riders, not those already dropped off',()=>{
 const delivered={...ride,id:'completed-dropoff',driver_finished:true};
 const stillRiding={...ride,id:'current'};
 const next={...ride,id:'pending',status:'Pending'};
 assert.equal(passengerSeatsUsed([stillRiding,delivered,next]),2);
 assert.equal(eligibleForBooking({driver,unfinished:[delivered,stillRiding,next],mode:'Sharing',requested}),true);
});
test('No overbooking and no joining active emergency',()=>{
 const group=[ride,...Array.from({length:3},(_,i)=>({...ride,id:'r'+i}))];
 assert.equal(eligibleForBooking({driver,unfinished:group,mode:'Sharing',requested}),false);
 assert.equal(eligibleForBooking({driver,unfinished:[{...ride,emergency_flag:true}],mode:'Sharing',requested}),false);
});
test('No pickup route remains when all passengers have been dropped off',()=>{
 const delivered={...ride,driver_finished:true};
 assert.equal(eligibleForBooking({driver,unfinished:[delivered],mode:'Sharing',requested}),false);
});
