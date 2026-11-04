'use strict';
const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');
const { isExpoToken, pushToUser } = require('../services/pushTransport');
const router = express.Router();
router.use(auth);

// The client may only register a token for its own authenticated account.
router.post('/register', async (req, res) => {
  const { token, platform = 'android' } = req.body || {};
  if (!isExpoToken(token) || !['android', 'ios'].includes(platform)) {
    return res.status(400).json({ message: 'Invalid push token' });
  }
  try {
    await pool.query(`
      INSERT INTO push_device_tokens(token,user_id,platform)
      VALUES($1,$2,$3)
      ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,
        platform=EXCLUDED.platform, last_seen_at=NOW()
    `, [token, req.user.id, platform]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Push registration:', err.message);
    return res.status(500).json({ message: 'Could not register push notification' });
  }
});

router.delete('/register', async (req, res) => {
  const token = req.body?.token;
  if (!isExpoToken(token)) return res.status(400).json({ message: 'Invalid push token' });
  try {
    await pool.query('DELETE FROM push_device_tokens WHERE token=$1 AND user_id=$2', [token, req.user.id]);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: 'Could not deregister device' });
  }
});

// Controlled dev-only probe; disabled unless explicitly enabled in backend .env.
const testCooldown = new Map();
router.post('/test', async (req, res) => {
  if (process.env.ENABLE_PUSH_TESTS !== 'true') return res.sendStatus(404);
  const id = String(req.user.id);
  if ((testCooldown.get(id) || 0) > Date.now() - 60_000) {
    return res.status(429).json({ message: 'Wait 60 seconds before another test' });
  }
  testCooldown.set(id, Date.now());
  try {
    const result = await pushToUser(req.user.id, {
      title: 'ES4WOMEN&CHILDREN', body: 'Push notifications are connected.', kind: 'test',
    });
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ message: 'Push service rejected test', detail: err.message });
  }
});
module.exports = router;
