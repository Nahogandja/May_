'use strict';
// Automatic *replacement* code issuance. Never completes a trip or releases a driver.
const { randomInt } = require('node:crypto');
const pool = require('../config/db');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

async function rotateOverdueArrivalCodes() {
  const client = await pool.connect();
  let rotated = 0;
  try {
    await client.query('BEGIN');
    // A single rotation five minutes after a driver marks arrival. Never rotate an
    // emergency or unresolved safety incident. SKIP LOCKED supports multiple instances.
    const { rows } = await client.query(`
      SELECT r.id FROM rides r
      WHERE r.status = 'Active' AND r.driver_finished = TRUE
        AND r.safe_arrived = FALSE AND r.emergency_flag = FALSE
        AND r.safety_status = 'Normal'
        AND r.driver_finished_at <= NOW() - INTERVAL '5 minutes'
        AND r.arrival_code_rotated_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM ride_safety_alerts a WHERE a.ride_id=r.id
                        AND a.status IN ('AwaitingPassenger','AwaitingAdmin','NeedsHelp'))
        AND NOT EXISTS (SELECT 1 FROM emergency_alerts e WHERE e.ride_id=r.id
                        AND e.status <> 'Resolved')
      ORDER BY r.driver_finished_at ASC
      LIMIT 100 FOR UPDATE OF r SKIP LOCKED
    `);
    for (const row of rows) {
      await client.query(`UPDATE rides
        SET safe_arrival_code=$2, arrival_code_rotated_at=NOW()
        WHERE id=$1`, [row.id, makeCode()]);
      rotated++;
    }
    await client.query('COMMIT');
    return rotated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function startAutomaticCodeRotation() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const count = await rotateOverdueArrivalCodes();
      if (count) console.log(`[ES4WAC] Automatically rotated ${count} overdue arrival code(s)`);
    } catch (err) {
      console.error('[ES4WAC] Arrival code automation failed:', err.message);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, 30_000);
  timer.unref?.();
  return timer;
}

module.exports = { makeCode, rotateOverdueArrivalCodes, startAutomaticCodeRotation };
