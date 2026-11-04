const pool = require('../config/db');
const { sendEmergencySMS } = require('../services/sms');
const { makeCode } = require('../services/automaticCodes');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedSources = new Set(['last_known', 'pickup', 'unavailable']);

// The academic demonstration records SOS events in PostgreSQL.
// It does NOT dispatch police, phone emergency contacts or send SMS.
const createEmergencyAlert = async (req, res) => {
  const { rideId, latitude, longitude, locationSource, affectedParties } = req.body || {};
  const affected = affectedParties === 'Both' ? 'Both' : 'Passenger';
  if (typeof rideId !== 'string' || !UUID.test(rideId)) {
    return res.status(400).json({ message: 'A valid rideId is required for SOS' });
  }

  const hasLat = latitude !== null && latitude !== undefined;
  const hasLng = longitude !== null && longitude !== undefined;
  if (hasLat !== hasLng ||
      (hasLat && (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180))) {
    return res.status(400).json({ message: 'Invalid SOS coordinates' });
  }
  const source = hasLat && hasLng
    ? (allowedSources.has(locationSource) && locationSource !== 'unavailable' ? locationSource : 'pickup')
    : 'unavailable';

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Serialize with booking transactions (driver lock first, then ride lock).
    const {rows: owners}=await client.query(`SELECT driver_id FROM rides
      WHERE id=$1 AND passenger_id=$2`,[rideId,req.user.id]);
    if (!owners.length) { await client.query('ROLLBACK');
      return res.status(404).json({message:'Ride not found for this passenger'}); }
    if (owners[0].driver_id) await client.query(`SELECT user_id FROM drivers
      WHERE user_id=$1 FOR UPDATE`,[owners[0].driver_id]);
    const rideResult = await client.query(
      `SELECT id, driver_id, status FROM rides
       WHERE id = $1 AND passenger_id = $2 FOR UPDATE`,
      [rideId, req.user.id],
    );
    if (!rideResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found for this passenger' });
    }
    const ride = rideResult.rows[0];
    if (!['Pending', 'Active'].includes(ride.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'SOS is available for Pending or Active rides' });
    }

    // Repeated taps within one minute return the same active incident.
    const existing = await client.query(
      `SELECT id, status FROM emergency_alerts
       WHERE ride_id = $1 AND passenger_id = $2
         AND status IN ('Open', 'Acknowledged')
         AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [rideId, req.user.id],
    );
    if (existing.rows.length) {
      await client.query('COMMIT');
      return res.json({
        message: 'SOS incident already recorded (demo)',
        alertId: existing.rows[0].id,
        status: existing.rows[0].status,
        simulated: true,
      });
    }

    const { rows } = await client.query(
      `INSERT INTO emergency_alerts
       (ride_id, passenger_id, driver_id, affected_parties, latitude, longitude, location_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status, created_at`,
      [rideId, req.user.id, ride.driver_id, affected, hasLat ? latitude : null,
        hasLng ? longitude : null, source],
    );
    // Replace the arrival code on every NEW passenger SOS. This does NOT dismiss the
    // incident, release the driver or permit safe-arrival verification during review.
    await client.query(`UPDATE rides
      SET emergency_flag = TRUE, safe_arrival_code = $2,
          arrival_code_rotated_at = NOW()
      WHERE id = $1`, [rideId, makeCode()]);
    if (ride.driver_id) await client.query(`UPDATE drivers SET is_available=FALSE
      WHERE user_id=$1`,[ride.driver_id]);
    await client.query('COMMIT');
    // Optional SMS: contact only the passenger's designated trusted contact.
    // Driver and passenger may both be endangered; admin sees both contacts for escalation.
    const contacts = await pool.query(`SELECT emergency_contact_name,emergency_contact_phone FROM users WHERE id=$1`,[req.user.id]);
    const emergencyPhone=contacts.rows[0]?.emergency_contact_phone;
    const smsStatus=await sendEmergencySMS(emergencyPhone,
      `ES4WAC SOS: ${contacts.rows[0]?.emergency_contact_name || 'Trusted contact'}, `+
      `an emergency was reported during a ES4WAC ride. Contact your loved one and local emergency services if needed. `+
      `Ride reference: ${rideId}.`);
    const driverContact = ride.driver_id ? await pool.query(`SELECT emergency_contact_phone FROM users WHERE id=$1`, [ride.driver_id]) : {rows:[]};
    const driverSmsStatus = affected === 'Both' && driverContact.rows[0]?.emergency_contact_phone &&
      driverContact.rows[0]?.emergency_contact_phone !== emergencyPhone
      ? await sendEmergencySMS(driverContact.rows[0].emergency_contact_phone,
          `ES4WAC urgent ride alert: A passenger reported an SOS during a ride assigned to your emergency contact. `+
          `Contact the person and local emergency services if needed. Ride reference ${rideId}.`)
      : 'not_applicable';
    await pool.query(`UPDATE emergency_alerts SET emergency_contact_sms_status=$2,
      driver_contact_sms_status=$3 WHERE id=$1`,
      [rows[0].id,smsStatus,driverSmsStatus]).catch(error=>
        console.error('SMS status could not be saved:',error.message));
    return res.status(201).json({
      message: 'SOS recorded for ES4WOMEN&CHILDREN admin review; replacement code issued privately',
      replacementCodeIssued: true,
      alertId: rows[0].id,
      status: rows[0].status,
      emergencyContactSmsStatus: smsStatus,
      driverContactSmsStatus: driverSmsStatus,
      affectedParties: affected,
      policeContacted: false,
      simulated: smsStatus !== 'submitted_to_provider' && driverSmsStatus !== 'submitted_to_provider',
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('SOS incident failed:', err);
    return res.status(500).json({ message: 'Could not record SOS incident' });
  } finally {
    if (client) client.release();
  }
};

// Driver SOS: the ride's passenger_id is retained to satisfy existing foreign keys,
// but the new reporter_role column accurately records who sent the alert.
const createDriverEmergencyAlert = async (req, res) => {
  const { rideId } = req.body || {};
  if (typeof rideId !== 'string' || !UUID.test(rideId))
    return res.status(400).json({ message: 'A valid rideId is required for driver SOS' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Driver lock first keeps lock order consistent with booking/start/end.
    await client.query('SELECT user_id FROM drivers WHERE user_id=$1 FOR UPDATE',[req.user.id]);
    const result = await client.query(`SELECT id, passenger_id, driver_id, status
      FROM rides WHERE id=$1 AND driver_id=$2 FOR UPDATE`, [rideId, req.user.id]);
    const ride = result.rows[0];
    if (!ride || !['Pending','Active'].includes(ride.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'SOS requires a current assigned ride' });
    }
    const existing = await client.query(`SELECT id, status FROM emergency_alerts
      WHERE ride_id=$1 AND reported_by_id=$2 AND status IN ('Open','Acknowledged')
        AND created_at > NOW() - INTERVAL '60 seconds'
      ORDER BY created_at DESC LIMIT 1`, [rideId, req.user.id]);
    if (existing.rows.length) {
      await client.query('COMMIT');
      return res.json({ message:'Existing driver SOS recorded',alertId:existing.rows[0].id,
        status:existing.rows[0].status,simulated:true });
    }
    const location = await client.query(`SELECT current_lat,current_lng FROM drivers
      WHERE user_id=$1`, [req.user.id]);
    const lat = Number(location.rows[0]?.current_lat);
    const lng = Number(location.rows[0]?.current_lng);
    const hasLocation = location.rows[0]?.current_lat != null &&
      location.rows[0]?.current_lng != null && Number.isFinite(lat) && Number.isFinite(lng);
    const alert = await client.query(`INSERT INTO emergency_alerts
      (ride_id,passenger_id,driver_id,affected_parties,latitude,longitude,location_source,
       reported_by_id,reported_by_role)
      VALUES ($1,$2,$3,'Both',$4,$5,$6,$3,'Driver') RETURNING id,status`,
      [rideId, ride.passenger_id,req.user.id,hasLocation?lat:null,
       hasLocation?lng:null,hasLocation?'last_known':'unavailable']);
    await client.query('UPDATE rides SET emergency_flag=TRUE WHERE id=$1',[rideId]);
    await client.query('UPDATE drivers SET is_available=FALSE WHERE user_id=$1',[req.user.id]);
    await client.query('COMMIT');
    // Optional SMS. Not an automated police dispatch.
    let smsStatus='not_configured';
    try {
      const {rows} = await pool.query(`SELECT emergency_contact_name,emergency_contact_phone
        FROM users WHERE id=$1`, [req.user.id]);
      const contact=rows[0];
      smsStatus=await sendEmergencySMS(contact?.emergency_contact_phone,
        `ES4WOMEN&CHILDREN DRIVER SOS: ${contact?.emergency_contact_name||'Trusted contact'}, an emergency was reported during ride ${rideId}. Contact the driver and local emergency services if necessary.`);
      await pool.query(`UPDATE emergency_alerts SET driver_contact_sms_status=$2
        WHERE id=$1`,[alert.rows[0].id,smsStatus]);
    } catch (error) { console.error('Driver SOS SMS:',error.message); }
    return res.status(201).json({message:'Driver SOS recorded for administrator review',
      alertId:alert.rows[0].id,status:alert.rows[0].status,
      driverContactSmsStatus:smsStatus,policeContacted:false});
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Driver SOS error:',error);
    return res.status(500).json({message:'Could not record driver SOS'});
  } finally {client.release();}
};

const listEmergencyAlerts = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.ride_id, e.status, e.latitude, e.longitude,
              e.location_source, e.created_at, e.updated_at,
              e.acknowledged_at, e.resolved_at, e.resolution_note,
              e.affected_parties,e.reported_by_role,e.reported_by_id,e.emergency_contact_sms_status,e.driver_contact_sms_status,e.contact_called_at,e.police_called_at,e.escalation_note,
              p.emergency_contact_name AS passenger_emergency_name,
              p.emergency_contact_phone AS passenger_emergency_phone,
              d.emergency_contact_name AS driver_emergency_name,
              d.emergency_contact_phone AS driver_emergency_phone,
              p.name AS passenger_name, p.phone AS passenger_phone,
              d.name AS driver_name, d.phone AS driver_phone,
              r.pickup, r.dropoff, r.status AS ride_status
       FROM emergency_alerts e
       JOIN users p ON p.id = e.passenger_id
       LEFT JOIN users d ON d.id = e.driver_id
       JOIN rides r ON r.id = e.ride_id
       ORDER BY CASE e.status WHEN 'Open' THEN 0
                                WHEN 'Acknowledged' THEN 1 ELSE 2 END,
                e.created_at DESC
       LIMIT 200`,
    );
    return res.json(rows);
  } catch (err) {
    console.error('IRT incident list failed:', err);
    return res.status(500).json({ message: 'Could not load SOS incidents' });
  }
};

const updateEmergencyAlert = async (req, res) => {
  const { id } = req.params;
  const { action, note } = req.body || {};
  if (!UUID.test(id)) return res.status(400).json({ message: 'Invalid incident ID' });
  if (action !== 'acknowledge' && action !== 'resolve') {
    return res.status(400).json({ message: 'Action must be acknowledge or resolve' });
  }
  if (action === 'resolve' && (typeof note !== 'string' || note.trim().length < 3 || note.length > 500)) {
    return res.status(400).json({ message: 'Please provide a short resolution note (3–500 characters)' });
  }
  try {
    const { rows } = await pool.query(
      action === 'acknowledge'
        ? `UPDATE emergency_alerts SET status = 'Acknowledged',
                acknowledged_at = NOW(), acknowledged_by = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'Open'
           RETURNING id, status`
        : `UPDATE emergency_alerts SET status = 'Resolved',
                resolved_at = NOW(), resolved_by = $2,
                resolution_note = $3, updated_at = NOW()
           WHERE id = $1 AND status = 'Acknowledged'
           RETURNING id, status`,
      action === 'acknowledge' ? [id, req.user.id] : [id, req.user.id, note.trim()],
    );
    if (rows.length) {
      if(action==='resolve') {
        await pool.query(`UPDATE rides SET emergency_flag=FALSE WHERE id=(SELECT ride_id FROM emergency_alerts WHERE id=$1)
          AND NOT EXISTS (SELECT 1 FROM emergency_alerts e WHERE e.ride_id=rides.id AND e.status!='Resolved')`,[id]);
      }
      return res.json({ message: `Incident ${rows[0].status.toLowerCase()}`, alert: rows[0] });
    }
    const found = await pool.query('SELECT status FROM emergency_alerts WHERE id = $1', [id]);
    return res.status(found.rows.length ? 409 : 404).json({
      message: found.rows.length
        ? 'Incident has changed status. Refresh and try again.'
        : 'Incident not found',
    });
  } catch (err) {
    console.error('IRT incident update failed:', err);
    return res.status(500).json({ message: 'Could not update SOS incident' });
  }
};

// Admin records calls that actually took place; MAY cannot dial police automatically.
const recordEscalation = async(req,res)=>{
  const kind=req.body?.kind;
  if (!UUID.test(req.params.id)||!['contact_called','police_called'].includes(kind))
    return res.status(400).json({message:'Select contact_called or police_called'});
  const note=String(req.body?.note||'').trim().slice(0,1000);
  if (note.length<3)return res.status(400).json({message:'Add a brief call note'});
  const field=kind==='contact_called'?'contact_called_at':'police_called_at';
  try {
    const {rows}=await pool.query(`UPDATE emergency_alerts SET ${field}=NOW(),
      escalation_note=COALESCE(escalation_note || E'\\n','') || $2,
      updated_at=NOW() WHERE id=$1 RETURNING id,contact_called_at,police_called_at`,
      [req.params.id, `${new Date().toISOString()} ${kind} by admin ${req.user.id}: ${note}`]);
    if (!rows.length)return res.status(404).json({message:'Incident not found'});
    return res.json({message:'Escalation documented',record:rows[0]});
  }catch(e){console.error(e);return res.status(500).json({message:'Failed to record call'});}
};
module.exports = { createEmergencyAlert, createDriverEmergencyAlert, listEmergencyAlerts, updateEmergencyAlert, recordEscalation };
