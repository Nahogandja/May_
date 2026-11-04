const pool = require('../config/db');
const { makeCode: code } = require('../services/automaticCodes');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function passengerResponse(req,res) {
  const id=req.params.id;
  if (!UUID.test(id) || typeof req.body?.safe !== 'boolean')
    return res.status(400).json({message:'Valid alert ID and safe boolean required'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT a.*,r.status AS ride_status,r.driver_finished,r.safe_arrived,
      r.emergency_flag FROM ride_safety_alerts a JOIN rides r ON r.id=a.ride_id
      WHERE a.id=$1 AND a.passenger_id=$2 FOR UPDATE OF a,r`,[id,req.user.id]);
    const a=rows[0];
    if (!a || a.status!=='AwaitingPassenger' || a.ride_status!=='Active' || a.driver_finished || a.safe_arrived)
      {await client.query('ROLLBACK');return res.status(409).json({message:'Safety check is no longer active'});}
    // Routine anomaly: if the passenger expressly confirms safety and no SOS exists,
    // issue a replacement code automatically rather than filling the admin queue.
    // A help request always requires human response and never rotates the code.
    const unresolvedSOS = await client.query(`SELECT 1 FROM emergency_alerts
      WHERE ride_id=$1 AND status <> 'Resolved' LIMIT 1`, [a.ride_id]);
    const safeToRotate = req.body.safe === true && !a.emergency_flag &&
      unresolvedSOS.rows.length === 0 &&
      ['off_route','idle','wrong_direction'].includes(a.reason);
    const nextStatus = safeToRotate ? 'CodeRotated' : req.body.safe ? 'AwaitingAdmin' : 'NeedsHelp';
    await client.query(`UPDATE ride_safety_alerts SET passenger_safe=$2,passenger_response_at=NOW(),
      status=$3, reviewed_at=CASE WHEN $3='CodeRotated' THEN NOW() ELSE reviewed_at END
      WHERE id=$1`, [id,req.body.safe,nextStatus]);
    if (safeToRotate) {
      await client.query(`UPDATE rides SET safe_arrival_code=$2,safety_status='Normal',
        deviation_samples=0, wrong_direction_samples=0 WHERE id=$1`, [a.ride_id,code()]);
    } else {
      await client.query(`UPDATE rides SET safety_status=$2,
        emergency_flag=CASE WHEN $2='NeedsHelp' THEN TRUE ELSE emergency_flag END WHERE id=$1`,
        [a.ride_id,nextStatus]);
    }
    await client.query('COMMIT');
    return res.json({
      message: safeToRotate ? 'A new Safe Arrival Code has been generated. Check your ride details.' :
        req.body.safe ? 'Response recorded. Safety administrator review is required.' :
        'Help requested. Contact emergency services directly if you are in danger.',
      newCodeIssued: safeToRotate,
    });
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return res.status(500).json({message:'Could not save safety response'});}
  finally{client.release();}
}
async function listSafetyAlerts(_req,res){
 try {
  const {rows}=await pool.query(`SELECT a.*,r.pickup,r.dropoff,r.status AS ride_status,
    r.driver_finished,r.emergency_flag,r.safe_arrived,
    p.name AS passenger_name,p.phone AS passenger_phone,
    p.emergency_contact_name,p.emergency_contact_phone,
    d.name AS driver_name,d.phone AS driver_phone,
    (SELECT e.status FROM emergency_alerts e WHERE e.ride_id=r.id ORDER BY e.created_at DESC LIMIT 1) AS latest_sos_status,
    (SELECT e.contact_called_at FROM emergency_alerts e WHERE e.ride_id=r.id ORDER BY e.created_at DESC LIMIT 1) AS contact_called_at,
    (SELECT e.police_called_at FROM emergency_alerts e WHERE e.ride_id=r.id ORDER BY e.created_at DESC LIMIT 1) AS police_called_at
    FROM ride_safety_alerts a JOIN rides r ON r.id=a.ride_id
    JOIN users p ON p.id=a.passenger_id LEFT JOIN users d ON d.id=a.driver_id
    ORDER BY CASE WHEN a.status IN ('AwaitingPassenger','NeedsHelp','AwaitingAdmin') THEN 0 ELSE 1 END,a.created_at DESC LIMIT 200`);
  res.json(rows);
 }catch(e){res.status(500).json({message:'Could not load route safety alerts'});}
}
async function reviewSafetyAlert(req,res){
 const id=req.params.id;const action=req.body?.action;
 if (!UUID.test(id)||!['rotate','resolve','resolve_emergency'].includes(action))
   return res.status(400).json({message:'Valid alert ID and action required'});
 const client=await pool.connect();
 try {
   await client.query('BEGIN');
   const {rows:link}=await client.query('SELECT ride_id FROM ride_safety_alerts WHERE id=$1',[id]);
   if (!link.length){await client.query('ROLLBACK');return res.status(404).json({message:'Alert not found'});}
   const {rows:r}=await client.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE',[link[0].ride_id]);
   const {rows:a}=await client.query('SELECT * FROM ride_safety_alerts WHERE id=$1 FOR UPDATE',[id]);
   const alert=a[0],ride=r[0];
   if (!alert||!ride || ride.status!=='Active'||ride.safe_arrived||ride.driver_finished || ride.emergency_flag){
     await client.query('ROLLBACK');return res.status(409).json({message:'Ride ended or has an unresolved emergency; do not issue a second code'});
   }
   if (action==='rotate' && (alert.status!=='AwaitingAdmin' || alert.passenger_safe!==true ||
       !['off_route','idle','wrong_direction'].includes(alert.reason))){
     await client.query('ROLLBACK');return res.status(409).json({message:'Passenger safety confirmation and qualifying route anomaly are required'});
   }
   if (action==='resolve' && !(alert.status==='AwaitingAdmin' && alert.passenger_safe===true)){
     await client.query('ROLLBACK');return res.status(409).json({message:'Passenger must confirm safety before an administrator can close this alert'});
   }
   if (action==='resolve_emergency') {
     const note=String(req.body?.note||'').trim();
     const emergency=await client.query(`SELECT status,contact_called_at,police_called_at
       FROM emergency_alerts WHERE ride_id=$1 ORDER BY created_at DESC LIMIT 1`,[ride.id]);
     const e=emergency.rows[0];
     if (note.length<15 || alert.status!=='NeedsHelp' || ride.emergency_flag ||
         !e || e.status!=='Resolved' || !e.contact_called_at || !e.police_called_at) {
       await client.query('ROLLBACK');
       return res.status(409).json({message:'Emergency must be resolved, trusted contact and police calls documented, and a detailed safety verification note supplied'});
     }
   }
   const nextStatus=action==='rotate'?'CodeRotated':'Resolved';
   if (action==='rotate') await client.query(`UPDATE rides SET safe_arrival_code=$2,safety_status='Normal',
        deviation_samples=0,wrong_direction_samples=0 WHERE id=$1`,[ride.id,code()]);
   else await client.query(`UPDATE rides SET safety_status='Normal',deviation_samples=0,wrong_direction_samples=0 WHERE id=$1`,[ride.id]);
   await client.query(`UPDATE ride_safety_alerts SET status=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$1`,[id,nextStatus,req.user.id]);
   await client.query('COMMIT');
   res.json({message:action==='rotate'?'Replacement code issued privately to passenger':'Safety review closed; original code retained',status:nextStatus});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e);res.status(500).json({message:'Could not review safety alert'});}
 finally{client.release();}
}
module.exports={passengerResponse,listSafetyAlerts,reviewSafetyAlert};
