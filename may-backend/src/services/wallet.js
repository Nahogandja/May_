'use strict';

// Academic demonstration: balances are imaginary Namibian dollars.
// Always call these helpers inside an existing SQL transaction (client.query).
// Store balances in integer cents, never floating point currency.
const DEMO_AMOUNTS_CENTS = Object.freeze([5000, 10000, 20000, 50000]);
const DEMO_CHANNELS = Object.freeze(['MoMo', 'Card']);

const cents = (value) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Invalid stored wallet amount');
  return result;
};

async function lockWallet(client, userId) {
  await client.query(
    `INSERT INTO wallets (user_id, balance_cents) VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const { rows } = await client.query(
    'SELECT balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
  if (!rows.length) throw new Error('Wallet not found');
  return cents(rows[0].balance_cents);
}

async function debitBooking(client, passengerId, rideId, amountCents) {
  const balance = await lockWallet(client, passengerId);
  if (balance < amountCents) return false;
  await client.query(
    `INSERT INTO wallet_transactions
       (user_id, ride_id, entry_type, amount_cents, description)
     VALUES ($1, $2, 'ride_payment', $3, 'Demo ride payment')`,
    [passengerId, rideId, -amountCents],
  );
  await client.query(
    `UPDATE wallets SET balance_cents = balance_cents - $2, updated_at = NOW()
     WHERE user_id = $1`,
    [passengerId, amountCents],
  );
  return true;
}

// Existing pre-wallet rides have no payment record, so they are not refunded or charged.
async function refundCancelledRide(client, passengerId, rideId) {
  const { rows } = await client.query(
    `SELECT amount_cents FROM wallet_transactions
     WHERE user_id = $1 AND ride_id = $2 AND entry_type = 'ride_payment'`,
    [passengerId, rideId],
  );
  if (!rows.length) return 0;
  const amount = -cents(rows[0].amount_cents);
  if (amount <= 0) throw new Error('Invalid original ride debit');
  await lockWallet(client, passengerId);
  const inserted = await client.query(
    `INSERT INTO wallet_transactions
       (user_id, ride_id, entry_type, amount_cents, description)
     VALUES ($1, $2, 'ride_refund', $3, 'Cancelled ride refund')
     ON CONFLICT DO NOTHING RETURNING id`,
    [passengerId, rideId, amount],
  );
  if (!inserted.rows.length) return 0;
  await client.query(
    `UPDATE wallets SET balance_cents = balance_cents + $2, updated_at = NOW()
     WHERE user_id = $1`,
    [passengerId, amount],
  );
  return amount;
}

async function creditDriverAfterArrival(client, driverId, passengerId, rideId) {
  // Pay only for newly wallet-paid trips; avoid retroactive earnings on old rides.
  const { rows } = await client.query(
    `SELECT amount_cents FROM wallet_transactions
     WHERE user_id = $1 AND ride_id = $2 AND entry_type = 'ride_payment'`,
    [passengerId, rideId],
  );
  if (!rows.length) return 0;
  const amount = -cents(rows[0].amount_cents);
  if (amount <= 0) throw new Error('Invalid ride payment amount');
  await lockWallet(client, driverId);
  const inserted = await client.query(
    `INSERT INTO wallet_transactions
       (user_id, ride_id, entry_type, amount_cents, description)
     VALUES ($1, $2, 'driver_earning', $3, 'Completed demo ride earning')
     ON CONFLICT DO NOTHING RETURNING id`,
    [driverId, rideId, amount],
  );
  if (!inserted.rows.length) return 0;
  await client.query(
    `UPDATE wallets SET balance_cents = balance_cents + $2, updated_at = NOW()
     WHERE user_id = $1`,
    [driverId, amount],
  );
  return amount;
}

module.exports = {
  DEMO_AMOUNTS_CENTS,
  DEMO_CHANNELS,
  cents,
  lockWallet,
  debitBooking,
  refundCancelledRide,
  creditDriverAfterArrival,
};
