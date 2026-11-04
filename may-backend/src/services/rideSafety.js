const pool = require('../config/db');
const { kmBetween } = require('./sharing');
// Best effort GPS monitoring while driver dashboard is foregrounded.
// Conservative multiple-sample thresholds help reduce false alarms.
const KM_TO_ROUTE = 0.75;
const KM_TO_DESTINATION_FOR_IDLE = 0.45;
const IDLE_MINUTES = 4;
const SAMPLE_TRIGGER = 3;
const EARTH_KM = 6371;
function distanceToRouteKm(lat, lng, coords) {
  if (!Array.isArray(coords) || coords.length < 2) return Infinity;
  const originLat = lat * Math.PI / 180;
  const yFactor = Math.PI / 180 * EARTH_KM;
  const xFactor = Math.cos(originLat) * yFactor;
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const [x1,y1] = coords[i-1], [x2,y2] = coords[i];
    if (![x1,y1,x2,y2].every(Number.isFinite)) continue;
    const ax=(x1-lng)*xFactor, ay=(y1-lat)*yFactor;
    const bx=(x2-lng)*xFactor, by=(y2-lat)*yFactor;
    const dx=bx-ax, dy=by-ay, mag=dx*dx+dy*dy;
    const t=mag ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/mag)):0;
    best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
  }
  return best;
}
async function processDriverLocation(driverId, lat, lng) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows} = await client.query(`SELECT id, passenger_id, dropoff_lat, dropoff_lng,
      planned_route, route_source, driver_finished, safety_status,
      last_driver_lat, last_driver_lng, last_driver_move_at, last_destination_km,
      deviation_samples, wrong_direction_samples
      FROM rides WHERE driver_id=$1 AND status='Active' AND safe_arrived=false
      FOR UPDATE`, [driverId]);
    const flagged=[];
    for (const ride of rows) {
      if (ride.driver_finished) continue;
      const destinationKm = kmBetween(lat,lng,Number(ride.dropoff_lat),Number(ride.dropoff_lng));
      const moved = ride.last_driver_lat == null || kmBetween(lat,lng,ride.last_driver_lat,ride.last_driver_lng) > 0.06;
      const lastMovedAt = moved ? new Date() : (ride.last_driver_move_at || new Date());
      const idleMs = Date.now()-new Date(lastMovedAt).getTime();
      const confirmedRoute = ride.route_source === 'osrm' && Array.isArray(ride.planned_route);
      const offRoute = confirmedRoute && distanceToRouteKm(lat,lng,ride.planned_route)>KM_TO_ROUTE;
      const offSamples = offRoute ? (ride.deviation_samples || 0)+1 : 0;
      const directionWorsening = moved && ride.last_destination_km != null &&
        destinationKm - Number(ride.last_destination_km) > 0.12 && destinationKm > 0.7;
      const wrongSamples = directionWorsening ? (ride.wrong_direction_samples || 0)+1 : 0;
      let reason = null;
      if (offSamples >= SAMPLE_TRIGGER) reason='off_route';
      else if (wrongSamples >= SAMPLE_TRIGGER) reason='wrong_direction';
      else if (idleMs >= IDLE_MINUTES*60*1000 && destinationKm > KM_TO_DESTINATION_FOR_IDLE) reason='idle';
      await client.query(`UPDATE rides SET last_driver_lat=$2,last_driver_lng=$3,
        last_driver_move_at=$4,last_destination_km=$5,deviation_samples=$6,wrong_direction_samples=$7
        WHERE id=$1`, [ride.id,lat,lng,lastMovedAt,destinationKm,offSamples,wrongSamples]);
      if (!reason || ride.safety_status !== 'Normal') continue;
      const inserted = await client.query(`INSERT INTO ride_safety_alerts
        (ride_id,passenger_id,driver_id,reason)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
        [ride.id, ride.passenger_id,driverId,reason]);
      if (inserted.rows.length) {
        await client.query(`UPDATE rides SET safety_status='AwaitingPassenger' WHERE id=$1`,[ride.id]);
        flagged.push({rideId:ride.id,reason});
      }
    }
    await client.query('COMMIT');
    return flagged;
  } catch(err) { await client.query('ROLLBACK').catch(()=>{});throw err; }
  finally {client.release();}
}
module.exports={processDriverLocation,distanceToRouteKm};
