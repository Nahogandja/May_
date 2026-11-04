'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

function loadWorker({ pushResult, smsEnabled = true, smsResult = 'submitted_to_provider' }) {
  const file = path.join(__dirname, '../src/services/rideReminders.js');
  let smsCalls = 0, pushCalls = 0, resultStatus = null, channel = null;
  const query = async (sql, args = []) => {
    if (sql.includes('SELECT rr.ride_id')) return { rows: [{ ride_id: 'ride-1', recipient_role: 'Passenger' }] };
    if (sql.includes("SET status='Sending'")) return { rowCount: 1 };
    if (sql.includes('SELECT r.scheduled_for')) return { rows: [{
      passenger_id: 'passenger-1', driver_id: 'driver-1',
      scheduled_for: new Date(Date.now() + 10*60000), pickup: 'Pickup', dropoff: 'Destination',
      passenger_phone: '+264000000000', driver_phone: '+264000000001'
    }] };
    if (sql.includes('delivery_channel=$4')) { resultStatus = args[2]; channel = args[3]; }
    return { rows: [], rowCount: 1 };
  };
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalRequire = mod.require.bind(mod);
  mod.require = id => {
    if (id === '../config/db') return { query };
    if (id === './sms') return {
      smsReady: () => smsEnabled,
      sendEmergencySMS: async () => { smsCalls++; return smsResult; }
    };
    if (id === './pushTransport') return {
      pushToUser: async () => { pushCalls++; return pushResult; },
      checkPushReceipts: async () => {},
    };
    return originalRequire(id);
  };
  mod._compile(fs.readFileSync(file, 'utf8'),file);
  return { run: mod.exports.runRideReminders, state: () => ({ smsCalls, pushCalls, resultStatus, channel }) };
}

test('accepted push suppresses SMS fallback', async () => {
  const work = loadWorker({pushResult:{accepted:1,eligible:1}});
  await work.run();
  assert.deepEqual(work.state(), { smsCalls:0,pushCalls:1,resultStatus:'Submitted',channel:'Push' });
});

test('no device token falls back to configured SMS', async () => {
  const work = loadWorker({pushResult:{accepted:0,eligible:0}});
  await work.run();
  assert.deepEqual(work.state(), { smsCalls:1,pushCalls:1,resultStatus:'Submitted',channel:'SMS' });
});

test('without push or SMS never claims message was sent', async () => {
  const work = loadWorker({pushResult:{accepted:0,eligible:0},smsEnabled:false});
  await work.run();
  assert.deepEqual(work.state(), { smsCalls:0,pushCalls:1,resultStatus:'Pending',channel:null });
});
