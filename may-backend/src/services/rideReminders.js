'use strict';
const pool = require('../config/db');
const { sendEmergencySMS, smsReady } = require('./sms');

// Ride reminders are sent no earlier than 15 minutes before pickup.
// PostgreSQL holds the per-ride/per-recipient state across restarts.
const formatPickupTime = date => new Intl.DateTimeFormat('en-NA', {
  timeZone: 'Africa/Windhoek', dateStyle: 'medium', timeStyle: 'short'
}).format(new Date(date));

let running = false;
async function runRideReminders() {
  if (running || !smsReady()) return; // No fake "sent" status without an SMS provider.
  running = true;
  try {
    await pool.query(`
      INSERT INTO ride_reminders(ride_id, recipient_role)
      SELECT r.id, who.role
      FROM rides r CROSS JOIN (VALUES ('Passenger'), ('Driver')) AS who(role)
      WHERE r.status = 'Pending'
        AND r.scheduled_for IS NOT NULL
        AND r.scheduled_for > NOW()
        AND r.scheduled_for <= NOW() + INTERVAL '15 minutes'
      ON CONFLICT (ride_id, recipient_role) DO NOTHING
    `);
    const { rows } = await pool.query(`
      SELECT rr.ride_id, rr.recipient_role
      FROM ride_reminders rr JOIN rides r ON r.id=rr.ride_id
      WHERE r.status='Pending' AND r.scheduled_for>NOW()
        AND r.scheduled_for<=NOW() + INTERVAL '15 minutes'
        AND (rr.status = 'Pending' AND (rr.last_attempt_at IS NULL OR
             rr.last_attempt_at < NOW() - INTERVAL '60 seconds')
          OR rr.status = 'Sending' AND rr.last_attempt_at < NOW() - INTERVAL '2 minutes')
        AND rr.attempts < 5
      ORDER BY r.scheduled_for ASC LIMIT 40
    `);
    for (const item of rows) {
      const claim = await pool.query(`
        UPDATE ride_reminders rr SET status='Sending', attempts=attempts+1,
          last_attempt_at=NOW()
        WHERE rr.ride_id=$1 AND rr.recipient_role=$2 AND rr.attempts<5
          AND (rr.status='Pending' AND (rr.last_attempt_at IS NULL OR
               rr.last_attempt_at < NOW() - INTERVAL '60 seconds')
            OR rr.status='Sending' AND rr.last_attempt_at<NOW()-INTERVAL '2 minutes')
        RETURNING ride_id
      `, [item.ride_id, item.recipient_role]);
      if (!claim.rowCount) continue; // Claimed by another worker.
      try {
        const { rows: bookings } = await pool.query(`
          SELECT r.scheduled_for, r.pickup, r.dropoff, r.status,
            p.phone AS passenger_phone, d.phone AS driver_phone
          FROM rides r JOIN users p ON p.id=r.passenger_id
          JOIN users d ON d.id=r.driver_id
          WHERE r.id=$1 AND r.status='Pending'
            AND r.scheduled_for>NOW()
            AND r.scheduled_for<=NOW() + INTERVAL '15 minutes'
        `, [item.ride_id]);
        if (!bookings.length) {
          await pool.query(`UPDATE ride_reminders SET status='Skipped' WHERE ride_id=$1 AND recipient_role=$2`,
            [item.ride_id, item.recipient_role]);
          continue;
        }
        const booking = bookings[0];
        const phone = item.recipient_role==='Passenger' ? booking.passenger_phone : booking.driver_phone;
        if (!phone) {
          await pool.query(`UPDATE ride_reminders SET status='Pending',last_error='Phone number missing' WHERE ride_id=$1 AND recipient_role=$2`,
            [item.ride_id, item.recipient_role]);
          continue;
        }
        const wording = item.recipient_role==='Driver' ? 'You have a passenger to collect' : 'Your booked ride is approaching';
        const message = `ES4WOMEN&CHILDREN reminder: ${wording} at ${formatPickupTime(booking.scheduled_for)}. Pickup: ${booking.pickup}. Destination: ${booking.dropoff}. Please be ready.`;
        const outcome = await sendEmergencySMS(phone, message);
        await pool.query(`UPDATE ride_reminders SET status=$3,
          submitted_at=CASE WHEN $3='Submitted' THEN NOW() ELSE submitted_at END,
          last_error=$4 WHERE ride_id=$1 AND recipient_role=$2`,
          [item.ride_id, item.recipient_role,
            outcome==='submitted_to_provider' ? 'Submitted' : 'Pending',
            outcome==='submitted_to_provider' ? null : outcome]);
        if (outcome!=='submitted_to_provider') console.warn('Reminder SMS not submitted:', outcome);
      } catch (error) {
        await pool.query(`UPDATE ride_reminders SET status='Pending', last_error='Temporary delivery error'
          WHERE ride_id=$1 AND recipient_role=$2`, [item.ride_id, item.recipient_role]).catch(()=>{});
        console.error('Ride reminder error:', error.message);
      }
    }
  } catch (error) { console.error('Ride reminder worker error:', error.message); }
  finally { running = false; }
}
function startRideReminders() {
  void runRideReminders();
  const interval = setInterval(() => void runRideReminders(), 30_000);
  interval.unref?.();
  return interval;
}
module.exports = { startRideReminders, runRideReminders, formatPickupTime };
