const pool = require('../config/db');

// GET /api/driver/rides
const getAssignedRides = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS passenger_name, u.phone AS passenger_phone
       FROM rides r
       JOIN users u ON r.passenger_id = u.id
       WHERE r.driver_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch rides', error: err.message });
  }
};

// PATCH /api/driver/start-ride/:id
const startRide = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE rides SET status = 'Active'
       WHERE id = $1 AND driver_id = $2
       RETURNING *`,
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Ride not found or not assigned to you' });
    res.json({ message: 'Ride started', ride: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not start ride', error: err.message });
  }
};

// PATCH /api/driver/end-ride/:id
const endRide = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE rides SET status = 'Completed'
       WHERE id = $1 AND driver_id = $2
       RETURNING *`,
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Ride not found or not assigned to you' });

    await pool.query(
      `UPDATE drivers SET is_available = true WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ message: 'Ride completed', ride: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not end ride', error: err.message });
  }
};

// PATCH /api/driver/location
const updateLocation = async (req, res) => {
  const { lat, lng } = req.body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ message: 'lat and lng must be numbers' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE drivers
       SET current_lat = $1, current_lng = $2, last_location_update = NOW()
       WHERE user_id = $3
       RETURNING id, current_lat, current_lng, last_location_update`,
      [lat, lng, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    res.json({ message: 'Location updated', location: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not update location', error: err.message });
  }
};

// PATCH /api/driver/availability
const setAvailability = async (req, res) => {
  const { isAvailable } = req.body;

  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({ message: 'isAvailable must be true or false' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT vetting_status FROM drivers WHERE user_id = $1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    if (isAvailable && rows[0].vetting_status !== 'Approved') {
      return res.status(403).json({ message: 'Driver is not yet approved to go online' });
    }

    await pool.query(
      `UPDATE drivers SET is_available = $1 WHERE user_id = $2`,
      [isAvailable, req.user.id]
    );

    res.json({ message: 'Availability updated', isAvailable });
  } catch (err) {
    res.status(500).json({ message: 'Could not update availability', error: err.message });
  }
};

module.exports = { getAssignedRides, startRide, endRide, updateLocation, setAvailability };
