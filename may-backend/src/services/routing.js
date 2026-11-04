// OSRM public demo server is rate-limited. Replace ROUTING_URL with a managed service for deployment.
const BASE = (process.env.ROUTING_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const valid = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
async function getRoadRoute(startLat, startLng, endLat, endLng) {
  if (!valid(startLat, -90, 90) || !valid(endLat, -90, 90) ||
      !valid(startLng, -180, 180) || !valid(endLng, -180, 180)) return null;
  const coords = `${startLng},${startLat};${endLng},${endLat}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
      { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data.routes?.[0];
    const points = route?.geometry?.coordinates;
    if (!Array.isArray(points) || points.length < 2 || points.length > 15000) return null;
    return {
      coordinates: points,
      steps: (route.legs || []).flatMap(leg => (leg.steps || []).map(step => ({
        instruction: [step.maneuver?.type?.replace(/_/g,' '), step.name].filter(Boolean).join(' — '),
        distanceMeters: Math.round(step.distance || 0)
      })).filter(step => step.instruction)).slice(0, 60),
      distanceKm: Number(route.distance || 0) / 1000
    };
  } catch (_) { return null; }
  finally { clearTimeout(t); }
}
module.exports = { getRoadRoute };
