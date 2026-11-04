const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path = require('node:path');

const authRoutes   = require('./routes/authRoutes');
const adminRoutes  = require('./routes/adminRoutes');
const driverRoutes = require('./routes/driverRoutes');
const rideRoutes   = require('./routes/rideRoutes');
const walletRoutes = require('./routes/walletRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/uploads/driver-headshots', express.static(path.join(__dirname, '../uploads/driver-headshots'), { immutable: true, maxAge: '1d' }));
app.use('/api/auth',   authRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/rides',  rideRoutes);
app.use('/api/wallet',  walletRoutes);
app.use('/api/messages', messageRoutes);

app.get('/health', (req, res) =>
  res.json({ status: 'ES4WAC API OK', database: 'PostgreSQL (local)', version: '2.0.0' })
);

module.exports = app;
