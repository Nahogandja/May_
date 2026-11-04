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

// Corridor matching for pickups *ahead* of a moving shared taxi.
// OSRM routes are [longitude, latitude] points. Fall back to the direct
// origin-to-destination line when road geometry wasn't available.
const routeLine = (ride) => {
  let line = ride.planned_route;
  if (typeof line === 'string') {
    try { line = JSON.parse(line); } catch { line = null; }
  }
  if (!Array.isArray(line) || line.length < 2 ||
      !line.every(p => Array.isArray(p) && p.length >= 2 &&
        validCoordinate(Number(p[1]), Number(p[0])))) {
    const c = coordsFromRide(ride);
    if (!validCoordinate(c.pickupLat,c.pickupLng) ||
        !validCoordinate(c.dropoffLat,c.dropoffLng)) return null;
    return [[c.pickupLng,c.pickupLat],[c.dropoffLng,c.dropoffLat]];
  }
  return line;
};

// Project geographic coordinates onto a local metric plane and find the
// point's distance along the polyline plus lateral detour distance.
const progressOnRoute = (lat, lng, line) => {
  if (!validCoordinate(lat,lng) || !line || line.length < 2) return null;
  const xFactor = 111.195 * Math.cos(lat * Math.PI / 180);
  const yFactor = 111.195;
  let run = 0, best = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a=line[i],b=line[i+1];
    const dx=(b[0]-a[0])*xFactor, dy=(b[1]-a[1])*yFactor;
    const segmentLength=Math.hypot(dx,dy);
    if (segmentLength < 0.000001) continue;
    const px=(lng-a[0])*xFactor, py=(lat-a[1])*yFactor;
    const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(segmentLength**2)));
    const dist=Math.hypot(px-t*dx,py-t*dy);
    const candidate={ distanceKm:dist, progressKm:run+t*segmentLength };
    if (!best || dist < best.distanceKm) best=candidate;
    run+=segmentLength;
  }
  return best;
};

const compatibleWithMovingSharedRide = (ride, requested, driver) => {
  const line=routeLine(ride);
  if (!line) return false;
  const here=progressOnRoute(Number(driver.current_lat),Number(driver.current_lng),line);
  const pickup=progressOnRoute(requested.pickupLat,requested.pickupLng,line);
  const dropoff=progressOnRoute(requested.dropoffLat,requested.dropoffLng,line);
  if (!here || !pickup || !dropoff) return false;
  return here.distanceKm <= 2 && pickup.distanceKm <= PICKUP_TOLERANCE_KM &&
    dropoff.distanceKm <= DROPOFF_TOLERANCE_KM &&
    // Allow a small GPS jitter behind the current position, not a trip backwards.
    pickup.progressKm >= here.progressKm - 0.25 &&
    dropoff.progressKm >= pickup.progressKm + 0.05;
};

const passengerSeatsUsed = rides => rides.filter(r =>
  !r.driver_finished && (!r.scheduled_for ||
    new Date(r.scheduled_for).getTime() <= Date.now() + 15*60000)
).length;

const eligibleForBooking = ({ driver, unfinished, mode, requested }) => {
  if (driver.vetting_status !== 'Approved' || driver.is_available !== true ||
      driver.vehicle_category !== 'Standard' ||
      driver.current_lat == null || driver.current_lng == null) return false;
  if (unfinished.some(r => r.emergency_flag ||
      (r.safety_status && r.safety_status !== 'Normal'))) return false;
  if (mode === 'Solo') return unfinished.length === 0;
  if (mode !== 'Sharing') return false;
  const capacity=Number(driver.seat_capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || passengerSeatsUsed(unfinished) >= capacity)
    return false;
  if (!unfinished.length) return true;
  if (unfinished.some(r => r.booking_mode !== 'Sharing' || !r.shared_trip_id)) return false;
  const groupId=unfinished[0].shared_trip_id;
  if (unfinished.some(r=>r.shared_trip_id !== groupId)) return false;
  const moving = unfinished.find(r=>r.status==='Active' && !r.driver_finished);
  if (moving) return compatibleWithMovingSharedRide(moving,requested,driver);
  // An already-arrived group is not an ongoing pickup route. Wait for confirmation.
  if (unfinished.some(r=>r.status==='Active' && r.driver_finished)) return false;
  return unfinished.every(r=>r.status==='Pending' && routeCompatible(r,requested));
};

module.exports = { FARES, validCoordinate, kmBetween, routeCompatible,
  compatibleWithMovingSharedRide, passengerSeatsUsed, eligibleForBooking,
  routeLine, progressOnRoute };
