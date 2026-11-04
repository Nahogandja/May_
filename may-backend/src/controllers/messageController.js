const pool = require('../config/db');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canAccess = (r, user) => r &&
  (r.passenger_id === user.id || r.driver_id === user.id);

async function conversations(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT r.id AS ride_id, r.status, r.pickup, r.dropoff, r.scheduled_for,
        CASE WHEN r.passenger_id=$1 THEN du.name ELSE pu.name END AS contact_name,
        (SELECT m.body FROM ride_messages m WHERE m.ride_id=r.id
          ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.created_at FROM ride_messages m WHERE m.ride_id=r.id
          ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
      FROM rides r
      JOIN users pu ON pu.id=r.passenger_id
      JOIN users du ON du.id=r.driver_id
      WHERE (r.passenger_id=$1 OR r.driver_id=$1)
        AND (r.status IN ('Pending','Active') OR
          EXISTS (SELECT 1 FROM ride_messages m WHERE m.ride_id=r.id))
      ORDER BY COALESCE((SELECT MAX(m.created_at) FROM ride_messages m WHERE m.ride_id=r.id),r.created_at) DESC
      LIMIT 80`, [req.user.id]);
    res.json(rows);
  } catch (error) { res.status(500).json({message:'Could not load conversations'}); }
}
async function list(req, res) {
  if (!uuid.test(req.params.rideId)) return res.status(400).json({message:'Invalid ride'});
  try {
    const { rows: rides }=await pool.query('SELECT passenger_id,driver_id FROM rides WHERE id=$1',[req.params.rideId]);
    if (!canAccess(rides[0],req.user)) return res.status(403).json({message:'Conversation unavailable'});
    const { rows }=await pool.query(`SELECT m.id,m.ride_id,m.sender_id,m.body,m.created_at,
       u.name AS sender_name FROM ride_messages m JOIN users u ON u.id=m.sender_id
       WHERE m.ride_id=$1 ORDER BY m.created_at ASC LIMIT 200`,[req.params.rideId]);
    res.json(rows);
  } catch (error) { res.status(500).json({message:'Could not load messages'}); }
}
async function send(req, res) {
  const body=typeof req.body?.body==='string'?req.body.body.trim():'';
  if (!uuid.test(req.params.rideId)||!body||body.length>1200)
    return res.status(400).json({message:'Enter a message up to 1200 characters'});
  try {
    const { rows: rides }=await pool.query('SELECT passenger_id,driver_id,status FROM rides WHERE id=$1',[req.params.rideId]);
    const ride=rides[0];
    if (!canAccess(ride,req.user)) return res.status(403).json({message:'Conversation unavailable'});
    if (!['Pending','Active'].includes(ride.status))
      return res.status(409).json({message:'Messages can only be sent for pending or active rides'});
    const {rows}=await pool.query(`INSERT INTO ride_messages (ride_id,sender_id,body)
      VALUES ($1,$2,$3) RETURNING *`,[req.params.rideId,req.user.id,body]);
    res.status(201).json(rows[0]);
  } catch(error) { res.status(500).json({message:'Message could not be sent'}); }
}
module.exports={conversations,list,send};
