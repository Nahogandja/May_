'use strict';
// Approximation for the academic prototype; not traffic-aware live navigation.
const { kmBetween, routeLine, progressOnRoute, validCoordinate } = require('./sharing');
const CITY_SPEED_KMH = 22;
function estimatePickupWaitMinutes(driver, unfinished, requested) {
  if (driver.current_lat == null || driver.current_lng == null ||
      requested.pickupLat == null || requested.pickupLng == null) return null;
  const hereLat = Number(driver.current_lat), hereLng = Number(driver.current_lng);
  if (!validCoordinate(hereLat, hereLng) ||
      !validCoordinate(requested.pickupLat, requested.pickupLng)) return null;
  const directKm = kmBetween(hereLat, hereLng, requested.pickupLat, requested.pickupLng);
  let distanceKm = directKm * 1.35; // approximate road detour
  const moving = unfinished.find(r => r.status === 'Active' && !r.driver_finished && r.booking_mode === 'Sharing');
  if (moving) {
    const line = routeLine(moving);
    const here = progressOnRoute(hereLat, hereLng, line);
    const pickup = progressOnRoute(requested.pickupLat, requested.pickupLng, line);
    if (here && pickup && pickup.progressKm >= here.progressKm - .25 &&
        pickup.distanceKm <= 1.5 && here.distanceKm <= 2) {
      distanceKm = Math.max(directKm, pickup.progressKm - here.progressKm) + pickup.distanceKm;
    }
  }
  const pendingPickups = unfinished.filter(r => r.status === 'Pending').length;
  // Rider may wait while an existing passenger boards and/or is dropped off.
  const existingStops = unfinished.filter(r => r.status === 'Active' && !r.driver_finished).length;
  const stopMinutes = Math.min(20, pendingPickups * 3 + existingStops * 2);
  return Math.max(2, Math.min(120, Math.ceil(distanceKm / CITY_SPEED_KMH * 60 + 2 + stopMinutes)));
}
module.exports = { estimatePickupWaitMinutes };
