'use strict';
const pool = require('../config/db');

const PUSH_SEND = 'https://exp.host/--/api/v2/push/send';
const PUSH_RECEIPTS = 'https://exp.host/--/api/v2/push/getReceipts';
const isExpoToken = value => typeof value === 'string' &&
  /^(Expo|Exponent)PushToken\[[^\]\s]{10,200}\]$/.test(value);

async function expoRequest(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.errors?.length) {
    throw new Error(`Expo push service rejected request (HTTP ${response.status}): ${JSON.stringify(data?.errors || [])}`);
  }
  return data;
}

/** Returns number of messages accepted into Expo's queue (NOT delivery guarantee). */
async function pushToUser(userId, { title, body, rideId, kind = 'ride_reminder' }) {
  const { rows } = await pool.query(`
    SELECT token FROM push_device_tokens
    WHERE user_id=$1 AND last_seen_at > NOW() - INTERVAL '90 days'
    ORDER BY last_seen_at DESC LIMIT 8
  `, [userId]);
  const tokens = rows.map(r => r.token).filter(isExpoToken);
  if (!tokens.length) return { accepted: 0, eligible: 0 };
  const payload = tokens.map(to => ({
    to, title, body, sound: 'default', priority: 'high', channelId: 'ride-reminders',
    ttl: 1800, data: { kind, rideId },
  }));
  const result = await expoRequest(PUSH_SEND, payload);
  const tickets = Array.isArray(result?.data) ? result.data : [result?.data];
  let accepted = 0;
  for (let i = 0; i < tokens.length; i++) {
    const ticket = tickets[i];
    if (ticket?.status === 'ok' && ticket.id) {
      accepted++;
      await pool.query(`
        INSERT INTO push_delivery_receipts(receipt_id, token, ride_id)
        VALUES ($1,$2,$3) ON CONFLICT(receipt_id) DO NOTHING
      `, [ticket.id, tokens[i], rideId || null]);
    } else if (ticket?.details?.error === 'DeviceNotRegistered') {
      await pool.query('DELETE FROM push_device_tokens WHERE token=$1', [tokens[i]]);
    } else {
      console.warn('Push ticket rejected:', ticket?.details?.error || ticket?.message || 'unknown');
    }
  }
  return { accepted, eligible: tokens.length };
}

let receiptsBusy = false;
async function checkPushReceipts() {
  if (receiptsBusy) return;
  receiptsBusy = true;
  try {
    const { rows } = await pool.query(`
      SELECT receipt_id, token FROM push_delivery_receipts
      WHERE checked_at IS NULL AND created_at <= NOW() - INTERVAL '15 minutes'
      AND created_at > NOW() - INTERVAL '23 hours'
      ORDER BY created_at LIMIT 100
    `);
    if (!rows.length) return;
    const response = await expoRequest(PUSH_RECEIPTS, { ids: rows.map(r => r.receipt_id) });
    for (const item of rows) {
      const receipt = response?.data?.[item.receipt_id];
      if (!receipt) continue;
      await pool.query(`
        UPDATE push_delivery_receipts SET checked_at=NOW(), status=$2, error=$3
        WHERE receipt_id=$1
      `, [item.receipt_id, receipt.status || 'unknown', receipt.details?.error || null]);
      if (receipt.details?.error === 'DeviceNotRegistered') {
        await pool.query('DELETE FROM push_device_tokens WHERE token=$1', [item.token]);
      }
    }
    // Receipt IDs expire on Expo's servers after 24 hours.
    await pool.query(`DELETE FROM push_delivery_receipts WHERE created_at < NOW() - INTERVAL '30 days'`);
  } catch (err) { console.warn('Push receipt check:', err.message); }
  finally { receiptsBusy = false; }
}
module.exports = { isExpoToken, pushToUser, checkPushReceipts };
