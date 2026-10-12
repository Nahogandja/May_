const pool = require('../config/db');

// GET /api/driver/profile
const getProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT license_number, vehicle_details, vetting_status, background_check,
              is_available, current_lat, current_lng, last_location_update
       FROM drivers
       WHERE user_id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Driver profile not found' });
    res.json({ profile: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch driver profile', error: err.message });
  }
};

// PATCH /api/driver/profile
// Drivers may edit their licence and vehicle details only; approval fields remain admin-controlled.
const updateProfile = async (req, res) => {
  const licenseNumber = typeof req.body.licenseNumber === 'string' ? req.body.licenseNumber.trim() : null;
  const vehicleDetails = typeof req.body.vehicleDetails === 'string' ? req.body.vehicleDetails.trim() : null;

  if (licenseNumber === null || vehicleDetails === null) {
    return res.status(400).json({ message: 'licenseNumber and vehicleDetails are required' });
  }
  if (!licenseNumber || !vehicleDetails) {
    return res.status(400).json({ message: 'Licence number and vehicle details cannot be empty' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE drivers
       SET license_number = $1, vehicle_details = $2
       WHERE user_id = $3
       RETURNING license_number, vehicle_details, vetting_status, background_check,
                 is_available, current_lat, current_lng, last_location_update`,
      [licenseNumber, vehicleDetails, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Driver profile not found' });
    res.json({ message: 'Driver details saved', profile: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not save driver details', error: err.message });
  }
};

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
  try {
    const { rows } = await pool.query(
      `UPDATE rides
       SET status = 'Active', driver_finished = false
       WHERE id = $1 AND driver_id = $2 AND status = 'Pending'
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      return res.status(409).json({ message: 'Ride cannot be started. Check that it is assigned to you and has not already started.' });
    }
    res.json({ message: 'Ride started', ride: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not start ride', error: err.message });
  }
};

// PATCH /api/driver/end-ride/:id
// Reaching the destination does NOT complete the ride or release the driver.
// The passenger's safe-arrival code does that.
const endRide = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE rides
       SET driver_finished = true
       WHERE id = $1 AND driver_id = $2 AND status = 'Active'
         AND safe_arrived = false AND driver_finished = false
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      return res.status(409).json({ message: 'Ride is not active, is already awaiting confirmation, or is not assigned to you.' });
    }
    res.json({
      message: 'Destination reached. Waiting for passenger safe-arrival confirmation.',
      ride: rows[0],
      driverAvailable: false
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not update ride arrival', error: err.message });
  }
};

// PATCH /api/driver/location
const updateLocation = async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ message: 'Valid numeric lat and lng values are required' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE drivers
       SET current_lat = $1, current_lng = $2, last_location_update = NOW()
       WHERE user_id = $3
       RETURNING current_lat, current_lng, last_location_update`,
      [lat, lng, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Driver profile not found' });
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
      `SELECT vetting_status, is_available
       FROM drivers WHERE user_id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Driver profile not found' });

    if (isAvailable && rows[0].vetting_status !== 'Approved') {
      return res.status(403).json({ message: 'Driver is not yet approved to go online' });
    }

    if (isAvailable) {
      const unfinished = await pool.query(
        `SELECT id FROM rides
         WHERE driver_id = $1 AND status IN ('Pending', 'Active')
         LIMIT 1`,
        [req.user.id]
      );
      if (unfinished.rows.length) {
        return res.status(409).json({ message: 'You have an unfinished ride. The passenger must confirm safe arrival before you can go online.' });
      }
    }

    const { rows: updated } = await pool.query(
      `UPDATE drivers SET is_available = $1 WHERE user_id = $2
       RETURNING is_available`,
      [isAvailable, req.user.id]
    );
    res.json({ message: 'Availability updated', isAvailable: updated[0].is_available });
  } catch (err) {
    res.status(500).json({ message: 'Could not update availability', error: err.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getAssignedRides,
  startRide,
  endRide,
  updateLocation,
  setAvailability
};
