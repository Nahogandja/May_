require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Real-time ride tracking via Socket.IO
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Driver joins a ride room
  socket.on('join:ride', (rideId) => {
    socket.join(`ride:${rideId}`);
    console.log(`Socket ${socket.id} joined ride room: ${rideId}`);
  });

  // Driver broadcasts GPS location update
  socket.on('driver:location', ({ rideId, lat, lng }) => {
    socket.to(`ride:${rideId}`).emit('location:update', { lat, lng, timestamp: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`MAY API running on port ${PORT} | DB: PostgreSQL (local)`);
});
