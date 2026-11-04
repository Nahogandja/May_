'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const wallet = require('../src/services/wallet');

const PASSENGER = '99999999-9999-4999-8999-999999999999';
const DRIVER = '5650da7f-c774-4419-85d0-b78780edf391';
const RIDE = '11111111-1111-4111-8111-111111111111';
const res = () => ({
  code: 200, body: null,
  status(c) { this.code = c; return this; },
  json(body) { this.body = body; return this; },
});

function walletControllerWithPool(pool) {
  const filename = require.resolve('../src/controllers/walletController');
  const original = Module._load;
  delete require.cache[filename];
  Module._load = function(request, parent, isMain) {
    if (request === '../config/db' && parent?.filename === filename) return pool;
    return original.apply(this, arguments);
  };
  try { return require(filename); } finally { Module._load = original; }
}
function queryLog({ balance = 5000, priorPayment = -1500, inserted = true } = {}) {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('SELECT balance_cents FROM wallets')) return { rows: [{ balance_cents: String(balance) }] };
      if (sql.includes("entry_type = 'ride_payment'")) {
        return { rows: priorPayment === null ? [] : [{ amount_cents: String(priorPayment) }] };
      }
      if (sql.includes('ON CONFLICT DO NOTHING RETURNING id')) return { rows: inserted ? [{ id: 'txn' }] : [] };
      if (sql.includes('RETURNING balance_cents')) return { rows: [{ balance_cents: String(balance + (params?.[1] ?? 0)) }] };
      return { rows: [] };
    },
    release() {},
  };
  return { client, queries };
}

test('wallet money is represented in safe integer cents', () => {
  assert.equal(wallet.cents('1500'), 1500);
  assert.throws(() => wallet.cents('1.25'));
  assert.throws(() => wallet.cents('9007199254740993'));
});

test('new booking refuses insufficient demo funds without ledger debit', async () => {
  const { client, queries } = queryLog({ balance: 1000 });
  assert.equal(await wallet.debitBooking(client, PASSENGER, RIDE, 1500), false);
  assert.equal(queries.some((q) => q.sql.includes("'ride_payment'")), false);
});

test('booking debit records a negative N$15 and updates the balance', async () => {
  const { client, queries } = queryLog({ balance: 10000 });
  assert.equal(await wallet.debitBooking(client, PASSENGER, RIDE, 1500), true);
  assert.ok(queries.some((q) => q.sql.includes("'ride_payment'") && q.params[2] === -1500));
  assert.ok(queries.some((q) => q.sql.includes('balance_cents = balance_cents -') && q.params[1] === 1500));
});

test('pending cancellation refunds the exact recorded payment once', async () => {
  const { client, queries } = queryLog({ inserted: true });
  assert.equal(await wallet.refundCancelledRide(client, PASSENGER, RIDE), 1500);
  assert.ok(queries.some((q) => q.sql.includes("'ride_refund'") && q.params[2] === 1500));
  assert.ok(queries.some((q) => q.sql.includes('balance_cents = balance_cents +') && q.params[1] === 1500));
  const duplicate = queryLog({ inserted: false });
  assert.equal(await wallet.refundCancelledRide(duplicate.client, PASSENGER, RIDE), 0);
  assert.equal(duplicate.queries.some((q) => q.sql.includes('balance_cents = balance_cents +')), false);
});

test('legacy cancellation without payment has no retroactive refund', async () => {
  const { client, queries } = queryLog({ priorPayment: null });
  assert.equal(await wallet.refundCancelledRide(client, PASSENGER, RIDE), 0);
  assert.equal(queries.some((q) => q.sql.includes("'ride_refund'")), false);
});

test('driver is credited N$15 only for paid verified rides', async () => {
  const { client, queries } = queryLog();
  assert.equal(await wallet.creditDriverAfterArrival(client, DRIVER, PASSENGER, RIDE), 1500);
  assert.ok(queries.some((q) => q.sql.includes("'driver_earning'") && q.params[2] === 1500));
  const duplicate = queryLog({ inserted: false });
  assert.equal(await wallet.creditDriverAfterArrival(duplicate.client, DRIVER, PASSENGER, RIDE), 0);
  const legacy = queryLog({ priorPayment: null });
  assert.equal(await wallet.creditDriverAfterArrival(legacy.client, DRIVER, PASSENGER, RIDE), 0);
});

test('top-up rejects unsupported amounts and channels without querying DB', async () => {
  const controller = walletControllerWithPool({ connect() { throw new Error('DB should not be called'); } });
  for (const body of [{ amount: -50, channel: 'MoMo' }, { amount: 1000, channel: 'Card' },
    { amount: 100, channel: 'Bank' }, { amount: '100', channel: 'MoMo' }]) {
    const response = res();
    await controller.demoTopUp({ user: { id: PASSENGER, role: 'Passenger' }, body }, response);
    assert.equal(response.code, 400);
  }
});

test('driver cannot simulate a top-up', async () => {
  const controller = walletControllerWithPool({});
  const response = res();
  await controller.demoTopUp({ user: { id: DRIVER, role: 'Driver' }, body: { amount: 100, channel: 'MoMo' } }, response);
  assert.equal(response.code, 403);
});

test('N$100 MoMo demo top-up credits balance in a transaction', async () => {
  const { client, queries } = queryLog({ balance: 5000 });
  const controller = walletControllerWithPool({ async connect() { return client; } });
  const response = res();
  await controller.demoTopUp({ user: { id: PASSENGER, role: 'Passenger' }, body: { amount: 100, channel: 'MoMo' } }, response);
  assert.equal(response.code, 201);
  assert.equal(response.body.balanceCents, 15000);
  assert.equal(response.body.demo, true);
  assert.ok(queries.some((q) => q.sql.includes("'demo_topup'") && q.params[1] === 10000 && q.params[2] === 'MoMo'));
  assert.ok(queries.some((q) => q.sql === 'COMMIT'));
});

test('wallet history is scoped to authenticated user and labeled demo', async () => {
  const statements = [];
  const controller = walletControllerWithPool({
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes('SELECT balance_cents')) return { rows: [{ balance_cents: '8500' }] };
      if (sql.includes('FROM wallet_transactions')) return { rows: [{ id: 'tx', amount_cents: '-1500', entry_type: 'ride_payment' }] };
      return { rows: [] };
    },
  });
  const response = res();
  await controller.getWallet({ user: { id: PASSENGER, role: 'Passenger' } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.balanceCents, 8500);
  assert.equal(response.body.transactions[0].amountCents, -1500);
  assert.equal(response.body.demo, true);
  assert.ok(statements.every((q) => q.params?.[0] === PASSENGER));
});
