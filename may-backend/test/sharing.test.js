'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FARES, kmBetween, validCoordinate, routeCompatible, eligibleForBooking,
} = require('../src/services/sharing');

const driver = {
  user_id: 'driver-1', vetting_status: 'Approved', is_available: true,
  vehicle_category: 'Standard', seat_capacity: 3,
  current_lat: -22.6, current_lng: 17.08,
};
const requested = {
  pickupLat: -22.61, pickupLng: 17.08,
  dropoffLat: -22.57, dropoffLng: 17.095,
};
const a = {
  status: 'Pending', booking_mode: 'Sharing', shared_trip_id: 'group-1',
  pickup_lat: -22.611, pickup_lng: 17.08,
  dropoff_lat: -22.572, dropoff_lng: 17.097,
};
const allowed = (unfinished, mode = 'Sharing', d = driver) =>
  eligibleForBooking({ driver: d, unfinished, mode, requested });

test('Namibian demo fares are authoritative on the server', () => {
  assert.equal(FARES.Sharing, 15);
  assert.equal(FARES.Solo, 30);
});
test('coordinate validation rejects missing and out-of-range values', () => {
  assert.equal(validCoordinate(-22.6, 17.08), true);
  assert.equal(validCoordinate(91, 17), false);
  assert.equal(validCoordinate(null, 0), false);
  assert.equal(validCoordinate('1', 2), false);
});
test('nearby locations are measured with Haversine kilometres', () => {
  assert.ok(kmBetween(-22.6, 17.08, -22.6, 17.08) < 0.001);
  assert.ok(kmBetween(-22.6, 17.08, -22.61, 17.08) > 1);
});
test('a taxi with no rides can accept Sharing or Solo', () => {
  assert.equal(allowed([]), true);
  assert.equal(allowed([], 'Solo'), true);
});
test('a partly filled compatible group can be joined', () => {
  assert.equal(routeCompatible(a, requested), true);
  assert.equal(allowed([a]), true);
  assert.equal(allowed([a, a]), true);
});
test('a full taxi refuses additional bookings', () => {
  assert.equal(allowed([a, a, a]), false);
});
test('sharing refuses passengers heading to a different destination', () => {
  const differentDestination = { ...a, dropoff_lat: -22.3, dropoff_lng: 17.2 };
  assert.equal(routeCompatible(differentDestination, requested), false);
  assert.equal(allowed([differentDestination]), false);
});
test('sharing refuses incompatible pickup points', () => {
  assert.equal(allowed([{ ...a, pickup_lat: -22.8 }]), false);
});
test('sharing cannot join a running ride or Solo booking', () => {
  assert.equal(allowed([{ ...a, status: 'Active' }]), false);
  assert.equal(allowed([{ ...a, booking_mode: 'Solo' }]), false);
});
test('legacy sharing rides without group ID are not joinable', () => {
  assert.equal(allowed([{ ...a, shared_trip_id: null }]), false);
});
test('only the same sharing group is joinable', () => {
  assert.equal(allowed([a, { ...a, shared_trip_id: 'group-2' }]), false);
});
test('Solo always requires an empty cab', () => {
  assert.equal(allowed([a], 'Solo'), false);
});
test('unapproved or offline drivers are hidden', () => {
  assert.equal(allowed([], 'Sharing', { ...driver, vetting_status: 'Pending' }), false);
  assert.equal(allowed([], 'Sharing', { ...driver, is_available: false }), false);
  assert.equal(allowed([], 'Sharing', { ...driver, vehicle_category: 'Gold' }), false);
});
test('null legacy route coordinates are not interpreted as equator', () => {
  assert.equal(routeCompatible({ ...a, pickup_lat: null }, requested), false);
});
