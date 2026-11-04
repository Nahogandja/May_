'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const RIDE = '22222222-2222-4222-8222-222222222222';
const PASSENGER = '33333333-3333-4333-8333-333333333333';
const DRIVER = '44444444-4444-4444-8444-444444444444';
const ADMIN = '55555555-5555-4555-8555-555555555555';
const ALERT = '66666666-6666-4666-8666-666666666666';

function loadController(pool) {
  const filename = require.resolve('../src/controllers/emergencyController');
  const old = Module._load;
  delete require.cache[filename];
  Module._load = function(request, parent, isMain) {
    if (request === '../config/db' && parent?.filename === filename) return pool;
    return old.apply(this, arguments);
  };
  try { return require(filename); }
  finally { Module._load = old; }
}
function response() {
  return {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function mockPool({ ride = { driver_id: DRIVER, status: 'Active' }, existing = [], queryLog = [] } = {}) {
  const query = async (sql, params) => {
    queryLog.push([sql, params]);
    if (sql.includes('SELECT id, driver_id, status FROM rides')) return { rows: ride ? [ride] : [] };
    if (sql.includes('FROM emergency_alerts') && sql.includes('created_at >')) return { rows: existing };
    if (sql.includes('INSERT INTO emergency_alerts')) return { rows: [{ id: ALERT, status: 'Open' }] };
    return { rows: [] };
  };
  return { async connect() { return { query, release() {} }; }, query };
}

const base = { body: { rideId: RIDE, latitude: -22.6, longitude: 17.08, locationSource: 'last_known' }, user: { id: PASSENGER } };

test('SOS requires a valid ride id before DB work', async () => {
  const controller = loadController({ connect() { throw new Error('should not connect'); } });
  const res = response();
  await controller.createEmergencyAlert({ ...base, body: { rideId: 'invalid' } }, res);
  assert.equal(res.code, 400);
});

test('SOS rejects invalid coordinates before DB work', async () => {
  const controller = loadController({ connect() { throw new Error('should not connect'); } });
  const res = response();
  await controller.createEmergencyAlert({ ...base, body: { rideId: RIDE, latitude: 100, longitude: 17 } }, res);
  assert.equal(res.code, 400);
});

test('SOS cannot be filed against another passenger ride', async () => {
  const controller = loadController(mockPool({ ride: null }));
  const res = response();
  await controller.createEmergencyAlert(base, res);
  assert.equal(res.code, 404);
});

test('SOS refuses completed rides', async () => {
  const controller = loadController(mockPool({ ride: { status: 'Completed', driver_id: DRIVER } }));
  const res = response();
  await controller.createEmergencyAlert(base, res);
  assert.equal(res.code, 409);
});

test('SOS creates a persistent incident and flags the ride in one transaction', async () => {
  const log = [];
  const controller = loadController(mockPool({ queryLog: log }));
  const res = response();
  await controller.createEmergencyAlert(base, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.alertId, ALERT);
  assert.equal(res.body.simulated, true);
  assert.ok(log.some(([sql]) => sql.includes('INSERT INTO emergency_alerts')));
  assert.ok(log.some(([sql]) => sql.includes('UPDATE rides SET emergency_flag')));
  assert.ok(log.some(([sql]) => sql === 'COMMIT'));
});

test('repeated SOS uses the existing incident rather than creating duplicates', async () => {
  const log = [];
  const controller = loadController(mockPool({ queryLog: log, existing: [{ id: ALERT, status: 'Open' }] }));
  const res = response();
  await controller.createEmergencyAlert(base, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.alertId, ALERT);
  assert.ok(!log.some(([sql]) => sql.includes('INSERT INTO emergency_alerts')));
});

test('SOS without available location is still accepted and labeled unavailable', async () => {
  const log = [];
  const controller = loadController(mockPool({ queryLog: log }));
  const res = response();
  await controller.createEmergencyAlert({ ...base, body: { rideId: RIDE } }, res);
  assert.equal(res.code, 201);
  const params = log.find(([sql]) => sql.includes('INSERT INTO emergency_alerts'))[1];
  assert.deepEqual(params.slice(-3), [null, null, 'unavailable']);
});

test('IRT admin list fetches incident data', async () => {
  const controller = loadController({ async query(sql) {
    assert.ok(sql.includes('FROM emergency_alerts e'));
    return { rows: [{ id: ALERT, status: 'Open' }] };
  } });
  const res = response();
  await controller.listEmergencyAlerts({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.body[0].id, ALERT);
});

test('IRT admin requires resolution note', async () => {
  const controller = loadController({ query() { throw new Error('should not query'); } });
  const res = response();
  await controller.updateEmergencyAlert({ params: { id: ALERT }, body: { action: 'resolve' }, user: { id: ADMIN } }, res);
  assert.equal(res.code, 400);
});

test('IRT admin can acknowledge an Open incident', async () => {
  const controller = loadController({ async query(sql) {
    assert.ok(sql.includes("status = 'Acknowledged'"));
    return { rows: [{ id: ALERT, status: 'Acknowledged' }] };
  } });
  const res = response();
  await controller.updateEmergencyAlert({ params: { id: ALERT }, body: { action: 'acknowledge' }, user: { id: ADMIN } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.alert.status, 'Acknowledged');
});

test('IRT admin can resolve an acknowledged incident with note', async () => {
  const controller = loadController({ async query(sql, params) {
    if (sql.includes("status = 'Resolved'")) {
      assert.equal(params[2], 'Demo staff reviewed');
      return { rows: [{ id: ALERT, status: 'Resolved' }] };
    }
    assert.ok(sql.includes('UPDATE rides SET emergency_flag=FALSE'));
    return { rows: [] };
  } });
  const res = response();
  await controller.updateEmergencyAlert({ params: { id: ALERT }, body: { action: 'resolve', note: 'Demo staff reviewed' }, user: { id: ADMIN } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.alert.status, 'Resolved');
});
