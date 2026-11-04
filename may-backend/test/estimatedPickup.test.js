'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimatePickupWaitMinutes } = require('../src/services/estimatedPickup');

test('estimated time is a usable positive integer for a nearby driver',()=>{
  const mins=estimatePickupWaitMinutes({current_lat:-22.56,current_lng:17.06},[],{pickupLat:-22.55,pickupLng:17.07});
  assert.ok(Number.isInteger(mins) && mins>=2);
});
test('active group and queued pickups add delay to estimate',()=>{
  const driver={current_lat:-22.56,current_lng:17.06};
  const requested={pickupLat:-22.55,pickupLng:17.07};
  const idle=estimatePickupWaitMinutes(driver,[],requested);
  const withStops=estimatePickupWaitMinutes(driver,[
    {status:'Pending',booking_mode:'Sharing',driver_finished:false},
    {status:'Active',booking_mode:'Sharing',driver_finished:false}
  ],requested);
  assert.ok(withStops>idle);
});
test('invalid location produces unknown ETA',()=>{
  assert.equal(estimatePickupWaitMinutes({current_lat:null,current_lng:null},[],{pickupLat:0,pickupLng:0}),null);
});
