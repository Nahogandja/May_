'use strict';

// Academic MVP route matching: nearby pickup AND nearby destination, not turn-by-turn routing.
// Do not expand these tolerances without a route-aware matching service.
const PICKUP_TOLERANCE_KM = 1.5;
const DROPOFF_TOLERANCE_KM = 2.0;
const FARES = Object.freeze({ Sharing: 15, Solo: 30 });

const validCoordinate = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const kmBetween = (lat1, lng1, lat2, lng2) => {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const coordsFromRide = (ride) => ({
  pickupLat: Number(ride.pickup_lat),
  pickupLng: Number(ride.pickup_lng),
  dropoffLat: Number(ride.dropoff_lat),
  dropoffLng: Number(ride.dropoff_lng),
});

const routeCompatible = (existing, requested) => {
  // Null must never be coerced to coordinate zero.
  if (['pickup_lat', 'pickup_lng', 'dropoff_lat', 'dropoff_lng']
    .some((key) => existing[key] == null)) return false;
  const point = coordsFromRide(existing);
  if (!validCoordinate(point.pickupLat, point.pickupLng) ||
      !validCoordinate(point.dropoffLat, point.dropoffLng) ||
      !validCoordinate(requested.pickupLat, requested.pickupLng) ||
      !validCoordinate(requested.dropoffLat, requested.dropoffLng)) return false;

  return kmBetween(point.pickupLat, point.pickupLng,
    requested.pickupLat, requested.pickupLng) <= PICKUP_TOLERANCE_KM &&
    kmBetween(point.dropoffLat, point.dropoffLng,
      requested.dropoffLat, requested.dropoffLng) <= DROPOFF_TOLERANCE_KM;
};

const eligibleForBooking = ({ driver, unfinished, mode, requested }) => {
  if (driver.vetting_status !== 'Approved' || driver.is_available !== true ||
      driver.vehicle_category !== 'Standard' ||
      driver.current_lat == null || driver.current_lng == null) return false;
  if (mode === 'Solo') return unfinished.length === 0;
  if (mode !== 'Sharing') return false;
  const capacity = Number(driver.seat_capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || unfinished.length >= capacity) return false;
  if (!unfinished.length) return true;
  const groupId = unfinished[0].shared_trip_id;
  // Legacy Sharing rides without a group cannot be joined safely.
  return Boolean(groupId) && unfinished.every((ride) =>
    ride.status === 'Pending' && ride.booking_mode === 'Sharing' &&
    ride.shared_trip_id === groupId && routeCompatible(ride, requested));
};

module.exports = { FARES, validCoordinate, kmBetween, routeCompatible, eligibleForBooking };
