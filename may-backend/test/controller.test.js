'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const DRIVER = '5650da7f-c774-4419-85d0-b78780edf391';
const PASSENGER = '99999999-9999-4999-8999-999999999999';
const RIDE = '11111111-1111-4111-8111-111111111111';
const requestPoint = { pickupLat: -22.61, pickupLng: 17.08, dropoffLat: -22.57, dropoffLng: 17.095 };
const driver = {
  user_id: DRIVER, name: 'Driver Test', vehicle_details: 'Test taxi',
  vetting_status: 'Approved', is_available: true, vehicle_category: 'Standard',
  seat_capacity: 3, current_lat: -22.6, current_lng: 17.08,
};
const priorRide = {
  driver_id: DRIVER, status: 'Pending', booking_mode: 'Sharing',
  shared_trip_id: RIDE, pickup_lat: -22.611, pickup_lng: 17.08,
  dropoff_lat: -22.572, dropoff_lng: 17.097,
};

function controllerWithPool(pool) {
  const original = Module._load;
  const filename = require.resolve('../src/controllers/rideController');
  delete require.cache[filename];
  Module._load = function(request, parent, isMain) {
    if (request === '../config/db' && parent?.filename === filename) return pool;
    return original.apply(this, arguments);
  };
  try { return require(filename); }
  finally { Module._load = original; }
}
function res() {
  return {
    code: 200, body: null,
    status(c) { this.code = c; return this; },
    json(data) { this.body = data; return this; },
  };
}

test('available Sharing taxis include only compatible open groups and correct seats', async () => {
  const controller = controllerWithPool({
    async query(sql) {
      if (sql.includes('FROM drivers d JOIN users')) return { rows: [driver] };
      if (sql.includes('FROM rides WHERE driver_id = ANY')) return { rows: [priorRide] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  const response = res();
  await controller.getAvailableCabs({ query: {
    lat: String(requestPoint.pickupLat), lng: String(requestPoint.pickupLng),
    dropoffLat: String(requestPoint.dropoffLat), dropoffLng: String(requestPoint.dropoffLng),
    bookingMode: 'Sharing', category: 'Standard',
  } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].seatsAvailable, 2);
  assert.equal(response.body[0].fare, 15);
  assert.equal(response.body[0].joiningGroup, true);
  assert.equal('driverPhone' in response.body[0], false);
});

test('booking compatible Sharing ride charges N$15 and leaves free seats', async () => {
  const queries = [];
  const pool = {
    async connect() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          if (sql.includes('SELECT id FROM users')) return { rows: [{ id: PASSENGER }] };
          if (sql.includes('FROM rides WHERE passenger_id')) return { rows: [] };
          if (sql.includes('FROM drivers d JOIN users')) return { rows: [driver] };
          if (sql.includes('FROM rides WHERE driver_id')) return { rows: [priorRide] };
          if (sql.includes('INSERT INTO rides')) return { rows: [{ id: RIDE, safe_arrival_code: 'CODE12' }] };
          if (sql.includes('SELECT balance_cents FROM wallets')) return { rows: [{ balance_cents: '10000' }] };
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  const controller = controllerWithPool(pool);
  const response = res();
  await controller.bookRide({ body: {
    pickup: 'Pickup', dropoff: 'Dropoff', ...requestPoint,
    driverId: DRIVER, bookingMode: 'Sharing', pricingCategory: 'Standard',
  }, user: { id: PASSENGER } }, response);
  assert.equal(response.code, 201);
  assert.equal(response.body.fare, 15);
  assert.equal(response.body.seatsRemaining, 1);
  const inserted = queries.find((q) => q.sql.includes('INSERT INTO rides'));
  assert.equal(inserted.params[11], 15);
  assert.equal(inserted.params[12], RIDE);
  assert.equal(queries.some((q) => q.sql.includes("'ride_payment'") && q.params?.[2] === -1500), true);
  assert.equal(response.body.payment.amountCents, 1500);
  assert.equal(queries.some((q) => q.sql.includes('SET is_available = FALSE')), false);
});

test('double booking a busy taxi in Solo mode returns HTTP 409', async () => {
  const pool = {
    async connect() { return {
      async query(sql) {
        if (sql.includes('FROM rides WHERE passenger_id')) return { rows: [] };
        if (sql.includes('FROM drivers d JOIN users')) return { rows: [driver] };
        if (sql.includes('FROM rides WHERE driver_id')) return { rows: [priorRide] };
        return { rows: [] };
      }, release() {},
    }; },
  };
  const controller = controllerWithPool(pool);
  const response = res();
  await controller.bookRide({ body: {
    pickup: 'Pickup', dropoff: 'Dropoff', ...requestPoint,
    driverId: DRIVER, bookingMode: 'Solo', pricingCategory: 'Standard',
  }, user: { id: PASSENGER } }, response);
  assert.equal(response.code, 409);
});

test('Safe Arrival does not free driver while another shared passenger is unfinished', async () => {
  let released = false;
  const pool = {
    async connect() { return {
      async query(sql) {
        if (sql.startsWith('SELECT driver_id FROM rides')) return { rows: [{ driver_id: DRIVER }] };
        if (sql.startsWith('SELECT * FROM rides')) return { rows: [{
          id: RIDE, driver_id: DRIVER, status: 'Active', safe_arrived: false,
          driver_finished: true, safe_arrival_code: 'CODE12',
        }] };
        if (sql.includes('SELECT COUNT(*)')) return { rows: [{ total: 1 }] };
        if (sql.includes('UPDATE drivers')) released = true;
        return { rows: [] };
      }, release() {},
    }; },
  };
  const controller = controllerWithPool(pool);
  const response = res();
  await controller.submitSafeArrival({ params: { id: RIDE }, user: { id: PASSENGER },
    body: { code: 'code12' } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.driverAvailable, false);
  assert.equal(released, false);
});

test('Safe Arrival releases taxi only after the last passenger completes', async () => {
  let released = false;
  const pool = {
    async connect() { return {
      async query(sql) {
        if (sql.startsWith('SELECT driver_id FROM rides')) return { rows: [{ driver_id: DRIVER }] };
        if (sql.startsWith('SELECT * FROM rides')) return { rows: [{
          id: RIDE, driver_id: DRIVER, status: 'Active', safe_arrived: false,
          driver_finished: true, safe_arrival_code: 'CODE12',
        }] };
        if (sql.includes('SELECT COUNT(*)')) return { rows: [{ total: 0 }] };
        if (sql.includes('UPDATE drivers')) {
          released = true;
          return { rows: [{ user_id: DRIVER }] };
        }
        return { rows: [] };
      }, release() {},
    }; },
  };
  const controller = controllerWithPool(pool);
  const response = res();
  await controller.submitSafeArrival({ params: { id: RIDE }, user: { id: PASSENGER },
    body: { code: 'CODE12' } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.driverAvailable, true);
  assert.equal(released, true);
});

test('cancelling a Pending ride releases an unoccupied taxi', async () => {
  let released = false;
  const pool = {
    async connect() { return {
      async query(sql) {
        if (sql.startsWith('SELECT driver_id FROM rides')) return { rows: [{ driver_id: DRIVER }] };
        if (sql.startsWith('SELECT id, status FROM rides')) return { rows: [{ id: RIDE, status: 'Pending' }] };
        if (sql.includes('SELECT status, booking_mode')) return { rows: [] };
        if (sql.includes('UPDATE drivers')) released = true;
        return { rows: [] };
      }, release() {},
    }; },
  };
  const controller = controllerWithPool(pool);
  const response = res();
  await controller.cancelRide({ params: { id: RIDE }, user: { id: PASSENGER } }, response);
  assert.equal(response.code, 200);
  assert.equal(released, true);
});

test('booking without enough MAY Wallet credits rolls back reservation', async () => {
  const sqls = [];
  const pool = { async connect() { return {
    async query(sql) {
      sqls.push(sql);
      if (sql.includes('FROM rides WHERE passenger_id')) return { rows: [] };
      if (sql.includes('FROM drivers d JOIN users')) return { rows: [driver] };
      if (sql.includes('FROM rides WHERE driver_id')) return { rows: [] };
      if (sql.includes('INSERT INTO rides')) return { rows: [{ id: RIDE, safe_arrival_code: 'CODE12' }] };
      if (sql.includes('SELECT balance_cents FROM wallets')) return { rows: [{ balance_cents: '0' }] };
      return { rows: [] };
    }, release() {},
  }; } };
  const controller = controllerWithPool(pool);
  const response = res();
  await controller.bookRide({ body: {
    pickup: 'Pickup', dropoff: 'Dropoff', ...requestPoint,
    driverId: DRIVER, bookingMode: 'Solo', pricingCategory: 'Standard',
  }, user: { id: PASSENGER } }, response);
  assert.equal(response.code, 409);
  assert.match(response.body.message, /wallet.*top up/i);
  assert.equal(sqls.includes('ROLLBACK'), true);
  assert.equal(sqls.includes('COMMIT'), false);
});

test('verified paid ride credits driver wallet once inside Safe Arrival transaction', async () => {
  const sqls = [];
  const pool = { async connect() { return {
    async query(sql, params) {
      sqls.push({ sql, params });
      if (sql.startsWith('SELECT driver_id FROM rides')) return { rows: [{ driver_id: DRIVER }] };
      if (sql.startsWith('SELECT * FROM rides')) return { rows: [{
        id: RIDE, driver_id: DRIVER, status: 'Active', safe_arrived: false,
        driver_finished: true, safe_arrival_code: 'CODE12',
      }] };
      if (sql.includes("entry_type = 'ride_payment'")) return { rows: [{ amount_cents: '-3000' }] };
      if (sql.includes('SELECT balance_cents FROM wallets')) return { rows: [{ balance_cents: '0' }] };
      if (sql.includes('ON CONFLICT DO NOTHING RETURNING id')) return { rows: [{ id: 'earning' }] };
      if (sql.includes('SELECT COUNT(*)')) return { rows: [{ total: 0 }] };
      if (sql.includes('UPDATE drivers')) return { rows: [{ user_id: DRIVER }] };
      return { rows: [] };
    }, release() {},
  }; } };
  const response = res();
  const controller = controllerWithPool(pool);
  await controller.submitSafeArrival({ params: { id: RIDE }, user: { id: PASSENGER },
    body: { code: 'CODE12' } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.driverEarningCents, 3000);
  assert.ok(sqls.some((q) => q.sql.includes("'driver_earning'") && q.params[2] === 3000));
  assert.ok(sqls.some((q) => q.sql === 'COMMIT'));
});

test('cancelling paid Pending ride refunds demo wallet in same transaction', async () => {
  const sqls = [];
  const pool = { async connect() { return {
    async query(sql, params) {
      sqls.push({ sql, params });
      if (sql.startsWith('SELECT driver_id FROM rides')) return { rows: [{ driver_id: DRIVER }] };
      if (sql.startsWith('SELECT id, status FROM rides')) return { rows: [{ id: RIDE, status: 'Pending' }] };
      if (sql.includes("entry_type = 'ride_payment'")) return { rows: [{ amount_cents: '-1500' }] };
      if (sql.includes('SELECT balance_cents FROM wallets')) return { rows: [{ balance_cents: '8500' }] };
      if (sql.includes('ON CONFLICT DO NOTHING RETURNING id')) return { rows: [{ id: 'refund' }] };
      if (sql.includes('SELECT status, booking_mode')) return { rows: [] };
      return { rows: [] };
    }, release() {},
  }; } };
  const controller = controllerWithPool(pool);
  const response = res();
  await controller.cancelRide({ params: { id: RIDE }, user: { id: PASSENGER } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.refundedCents, 1500);
  assert.ok(sqls.some((q) => q.sql.includes("'ride_refund'") && q.params[2] === 1500));
  assert.ok(sqls.some((q) => q.sql === 'COMMIT'));
});
