'use strict';
const pool = require('../config/db');
const { DEMO_AMOUNTS_CENTS, DEMO_CHANNELS, cents, lockWallet } = require('../services/wallet');

// GET /api/wallet — passenger balance OR driver earnings, never other users' wallets.
const getWallet = async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO wallets (user_id, balance_cents) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [req.user.id],
    );
    const [wallet, history] = await Promise.all([
      pool.query('SELECT balance_cents FROM wallets WHERE user_id = $1', [req.user.id]),
      pool.query(
        `SELECT id, ride_id, entry_type, amount_cents, channel, description, created_at
         FROM wallet_transactions WHERE user_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 50`,
        [req.user.id],
      ),
    ]);
    return res.json({
      currency: 'NAD',
      demo: true,
      role: req.user.role,
      balanceCents: cents(wallet.rows[0].balance_cents),
      transactions: history.rows.map((tx) => ({
        ...tx,
        amountCents: cents(tx.amount_cents),
      })),
    });
  } catch (err) {
    console.error('Read wallet error:', err);
    return res.status(500).json({ message: 'Could not load ES4WAC Wallet' });
  }
};

// POST /api/wallet/demo-topup — explicitly fake money, never collect payment credentials.
const demoTopUp = async (req, res) => {
  if (req.user.role !== 'Passenger') {
    return res.status(403).json({ message: 'Only passengers can simulate wallet top-ups' });
  }
  const { amount, channel } = req.body || {};
  if (!Number.isInteger(amount) || !DEMO_AMOUNTS_CENTS.includes(amount * 100) ||
      !DEMO_CHANNELS.includes(channel)) {
    return res.status(400).json({ message: 'Choose a demo amount (N$50, N$100, N$200, N$500) and MoMo or Card' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockWallet(client, req.user.id);
    const amountCents = amount * 100;
    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, entry_type, amount_cents, channel, description)
       VALUES ($1, 'demo_topup', $2, $3, 'SIMULATED top-up — no real money')`,
      [req.user.id, amountCents, channel],
    );
    const { rows } = await client.query(
      `UPDATE wallets SET balance_cents = balance_cents + $2, updated_at = NOW()
       WHERE user_id = $1 RETURNING balance_cents`,
      [req.user.id, amountCents],
    );
    await client.query('COMMIT');
    return res.status(201).json({
      message: `Demo ${channel} top-up successful — no real money transferred`,
      demo: true,
      balanceCents: cents(rows[0].balance_cents),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Demo top-up error:', err);
    return res.status(500).json({ message: 'Could not simulate wallet top-up' });
  } finally {
    client.release();
  }
};

module.exports = { getWallet, demoTopUp };
