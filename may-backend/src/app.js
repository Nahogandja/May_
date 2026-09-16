const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const authRoutes   = require('./routes/authRoutes');
const adminRoutes  = require('./routes/adminRoutes');
const driverRoutes = require('./routes/driverRoutes');
const rideRoutes   = require('./routes/rideRoutes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/auth',   authRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/rides',  rideRoutes);

app.get('/health', (req, res) =>
  res.json({ status: 'MAY API OK', database: 'PostgreSQL (local)', version: '2.0.0' })
);

module.exports = app;
