'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadController(mockPool) {
  const filename = require.resolve('../src/controllers/adminPaymentController');
  const original = Module._load;
  delete require.cache[filename];
  Module._load = function(request, parent, isMain) {
    if (request === '../config/db' && parent?.filename === filename) return mockPool;
    return original.apply(this, arguments);
  };
  try { return require(filename); } finally { Module._load = original; }
}
function response() {
  return { code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(data) { this.body = data; return this; },
  };
}
const summary = {
  paid_ride_count: 3,
  completed_paid_ride_count: 1,
  gross_paid_cents: '6000',
  refunded_cents: '1500',
  driver_credited_cents: '3000',
};
const records = [
  {
    payment_id: 'payment-1', ride_id: 'ride-1', paid_at: '2026-10-21T11:30:00Z',
    paid_cents: '1500', refunded_cents: '0', net_cents: '1500',
    driver_credited_cents: '1500', ride_status: 'Completed', booking_mode: 'Sharing',
    passenger_name: 'Passenger A', passenger_email: 'passenger@example.com',
    driver_name: 'Driver A',
  },
  {
    payment_id: 'payment-2', ride_id: 'ride-2', paid_at: '2026-10-21T12:00:00Z',
    paid_cents: '1500', refunded_cents: '1500', net_cents: '0',
    driver_credited_cents: '0', ride_status: 'Cancelled', booking_mode: 'Sharing',
    passenger_name: 'Passenger B', passenger_email: 'b@example.com',
    driver_name: 'Driver A', refunded_at: '2026-10-21T12:10:00Z',
  },
];

test('admin payment report shows gross, refunds, net and passenger/driver details', async () => {
  const sqls = [];
  const controller = loadController({
    async query(sql) {
      sqls.push(sql);
      if (sql.includes('COUNT(*)::INTEGER AS paid_ride_count')) return { rows: [summary] };
      if (sql.includes('p.id AS payment_id')) return { rows: records };
      throw new Error('Unexpected query');
    },
  });
  const res = response();
  await controller.listPayments({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.demo, true);
  assert.equal(res.body.summary.grossPaidCents, 6000);
  assert.equal(res.body.summary.refundedCents, 1500);
  assert.equal(res.body.summary.netPaidCents, 4500);
  assert.equal(res.body.summary.driverCreditedCents, 3000);
  assert.equal(res.body.summary.completedPaidRideCount, 1);
  assert.equal(res.body.records[0].paymentStatus, 'Paid');
  assert.equal(res.body.records[1].paymentStatus, 'Refunded');
  assert.equal(res.body.records[1].netCents, 0);
  assert.equal(res.body.records[0].paymentMethod, 'MAY Wallet (Demo)');
  assert.equal(res.body.records[0].passengerName, 'Passenger A');
  assert.ok(sqls.every(q => q.includes("'ride_payment'")));
});

test('an empty wallet ledger returns a zero-valued admin report', async () => {
  const controller = loadController({ async query(sql) {
    return sql.includes('paid_ride_count')
      ? { rows: [{ paid_ride_count: 0, completed_paid_ride_count: 0,
        gross_paid_cents: '0', refunded_cents: '0', driver_credited_cents: '0' }] }
      : { rows: [] };
  }});
  const res = response();
  await controller.listPayments({}, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.records, []);
  assert.equal(res.body.summary.netPaidCents, 0);
});

test('database failures return a safe error response', async () => {
  const controller = loadController({ async query() { throw new Error('Sensitive database message'); } });
  const res = response();
  const originalConsoleError = console.error;
  console.error = () => {};
  try { await controller.listPayments({}, res); } finally { console.error = originalConsoleError; }
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { message: 'Could not load payment records' });
});
