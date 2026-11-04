require('dotenv').config();
const { createServer } = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const pool = require('./src/config/db');
const app = require('./src/app');

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.SOCKET_ALLOWED_ORIGIN || false, methods: ['GET', 'POST'] },
});

// The prototype's realtime channel must not expose passenger locations to strangers.
// Client sockets should connect using: auth: { token: '<JWT>' }
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1', [decoded.id]);
    if (!rows.length) return next(new Error('Unauthorized'));
    socket.user = rows[0];
    return next();
  } catch {
    return next(new Error('Invalid token'));
  }
});

const isUuid = (id) => typeof id === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);

async function mayAccessRide(socket, rideId) {
  if (!isUuid(rideId)) return false;
  const { rows } = await pool.query(
    'SELECT passenger_id, driver_id FROM rides WHERE id = $1', [rideId],
  );
  if (!rows.length) return false;
  return socket.user.role === 'Admin' ||
    rows[0].passenger_id === socket.user.id || rows[0].driver_id === socket.user.id;
}

io.on('connection', (socket) => {
  socket.on('join:ride', async (rideId, respond) => {
    try {
      const allowed = await mayAccessRide(socket, rideId);
      if (!allowed) {
        if (typeof respond === 'function') respond({ ok: false });
        return;
      }
      await socket.join(`ride:${rideId}`);
      if (typeof respond === 'function') respond({ ok: true });
    } catch (err) {
      console.error('Socket join failed:', err);
      if (typeof respond === 'function') respond({ ok: false });
    }
  });

  socket.on('driver:location', async (payload) => {
    const { rideId, lat, lng } = payload || {};
    if (socket.user.role !== 'Driver' || !isUuid(rideId) ||
        typeof lat !== 'number' || typeof lng !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    try {
      const { rows } = await pool.query(
        `SELECT id FROM rides WHERE id = $1 AND driver_id = $2
         AND status = 'Active'`, [rideId, socket.user.id],
      );
      if (!rows.length) return;
      io.to(`ride:${rideId}`).emit('location:update', {
        lat, lng, timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Socket location broadcast failed:', err);
    }
  });
});

const { startAutomaticCodeRotation } = require('./src/services/automaticCodes');
const { startRideReminders } = require('./src/services/rideReminders');

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`ES4WOMEN&CHILDREN API running on port ${PORT} | DB: PostgreSQL (local)`);
  startAutomaticCodeRotation();
  startRideReminders();
});
