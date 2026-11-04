const pool = require('../config/db');
const { processDriverLocation } = require('../services/rideSafety');
const { getBookingState, syncDriverAvailability } = require('../services/driverAvailability');

// GET /api/driver/profile
const getProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.license_number, d.vehicle_details, d.vehicle_color, d.plate_number,
              d.headshot_url, d.certified_id_path, d.certified_licence_path,
              d.vetting_status, d.background_check, d.is_available, d.current_lat,
              d.current_lng, d.last_location_update, u.gender, u.phone
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE d.user_id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Driver profile not found' });
    res.json({ profile: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch driver profile', error: err.message });
  }
};

// PATCH /api/driver/profile
// Drivers may edit their personal gender and vehicle details. Vetting remains admin-controlled.
const updateProfile = async (req, res) => {
  const licenseNumber = typeof req.body.licenseNumber === 'string' ? req.body.licenseNumber.trim() : null;
  const vehicleDetails = typeof req.body.vehicleDetails === 'string' ? req.body.vehicleDetails.trim() : null;
  const vehicleColor = typeof req.body.vehicleColor === 'string' ? req.body.vehicleColor.trim().slice(0, 50) : '';
  const plateNumber = typeof req.body.plateNumber === 'string' ? req.body.plateNumber.trim().toUpperCase().slice(0, 30) : '';
  const gender = typeof req.body.gender === 'string' ? req.body.gender.trim() : '';
  const phone = String(req.body.phone || '').trim();

  if (!licenseNumber || !vehicleDetails || !vehicleColor || !plateNumber) {
    return res.status(400).json({ message: 'Licence, vehicle description, vehicle colour and plate number are required' });
  }
  if (!['Female', 'Male', 'Other', 'Prefer not to say'].includes(gender)) {
    return res.status(400).json({ message: 'Please select a gender option' });
  }

  if (!/^\+?[0-9][0-9 +()\-]{6,20}$/.test(phone)) {
    return res.status(400).json({ message: 'A valid driver phone number is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update the record actually checked by admin approval (users.gender).
    const user = await client.query(
      `UPDATE users SET gender = $1, phone = $2 WHERE id = $3 AND role = 'Driver' RETURNING gender, phone`,
      [gender, phone, req.user.id]
    );
    if (!user.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Driver account not found' });
    }

    const updated = await client.query(
      `UPDATE drivers
       SET license_number = $1, vehicle_details = $2, vehicle_color = $3, plate_number = $4,
           vetting_status = 'Pending', is_available = FALSE
       WHERE user_id = $5
       RETURNING license_number, vehicle_details, vehicle_color, plate_number,
                 headshot_url, certified_id_path, certified_licence_path,
                 vetting_status, background_check, is_available, current_lat,
                 current_lng, last_location_update`,
      [licenseNumber, vehicleDetails, vehicleColor, plateNumber, req.user.id]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    await client.query('COMMIT');
    return res.json({
      message: 'Driver details saved',
      profile: { ...updated.rows[0], gender: user.rows[0].gender, phone: user.rows[0].phone },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* Preserve original error. */ }
    return res.status(500).json({ message: 'Could not save driver details', error: err.message });
  } finally {
    client.release();
  }
};

// GET /api/driver/rides
const getAssignedRides = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.passenger_id, r.driver_id, r.pickup, r.dropoff,
              r.status, r.safe_arrived, r.driver_finished, r.emergency_flag,
              r.booking_mode, r.pricing_category, r.fare, r.shared_trip_id,
              r.created_at, r.scheduled_for, r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng,
              r.safety_status, u.name AS passenger_name, u.phone AS passenger_phone
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Coordinate with reservation lock so bookings cannot join after trip starts.
    const { rows: locked } = await client.query(
      'SELECT user_id FROM drivers WHERE user_id = $1 FOR UPDATE',
      [req.user.id],
    );
    if (!locked.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Driver profile not found' });
    }
    const { rows } = await client.query(
      `UPDATE rides SET status = 'Active', driver_finished = FALSE
       WHERE id = $1 AND driver_id = $2 AND status = 'Pending'
         AND (scheduled_for IS NULL OR scheduled_for <= NOW() + INTERVAL '15 minutes')
       RETURNING *`,
      [req.params.id, req.user.id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Ride is not pending or is not assigned to you' });
    }
    await syncDriverAvailability(client,req.user.id);
    await client.query('COMMIT');
    return res.json({ message: 'Ride started', ride: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Start ride error:', err);
    return res.status(500).json({ message: 'Could not start ride' });
  } finally {
    client.release();
  }
};

// PATCH /api/driver/end-ride/:id
// Reaching the destination does NOT complete the ride or release the driver.
// The passenger's safe-arrival code does that.
const endRide = async (req, res) => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize with new reservations: a dropped-off passenger releases a seat
    // only after the driver's destination action commits.
    await client.query('SELECT user_id FROM drivers WHERE user_id=$1 FOR UPDATE',[req.user.id]);
    const {rows}=await client.query(`UPDATE rides
      SET driver_finished=TRUE, driver_finished_at=NOW(), arrival_code_rotated_at=NULL
      WHERE id=$1 AND driver_id=$2 AND status='Active'
        AND safe_arrived=FALSE AND driver_finished=FALSE RETURNING *`,
      [req.params.id,req.user.id]);
    if(!rows.length){await client.query('ROLLBACK');
      return res.status(409).json({message:'Ride is not active or has already reached destination'});}
    const state=await syncDriverAvailability(client,req.user.id);
    await client.query('COMMIT');
    res.json({message:'Destination reached. Passenger must confirm Safe Arrival Code.',
      ride:rows[0],driverAvailable:state.canAccept,seatsRemaining:state.seatsRemaining||0});
  } catch(error){await client.query('ROLLBACK').catch(()=>{});
    console.error('End ride error:',error);
    res.status(500).json({message:'Could not mark destination reached'});
  } finally {client.release();}
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
    // GPS is processed only while the driver's app is active; this is not 24/7 tracking.
    await processDriverLocation(req.user.id, lat, lng).catch(err =>
      console.error('Route safety monitoring failed:', err.message));
    res.json({ message: 'Location updated', location: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not update location', error: err.message });
  }
};

// PATCH /api/driver/availability
const setAvailability = async (req, res) => {
  const { isAvailable } = req.body || {};
  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({ message: 'isAvailable must be true or false' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT d.vetting_status, d.is_available, d.license_number, d.vehicle_details,
         d.vehicle_color,d.plate_number,d.headshot_url,d.certified_id_path,d.certified_licence_path,u.gender
         FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.user_id = $1 FOR UPDATE OF d`,
      [req.user.id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Driver profile not found' });
    }
    if (isAvailable && rows[0].vetting_status !== 'Approved') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Driver is not yet approved to go online' });
    }
    if (isAvailable && !['license_number','vehicle_details','vehicle_color','plate_number',
      'headshot_url','certified_id_path','certified_licence_path','gender'].every(key=>Boolean(rows[0][key]))) {
      await client.query('ROLLBACK');
      return res.status(403).json({message:'Complete your driver details, photo and certified ID/licence uploads before going online'});
    }
    if (isAvailable) {
      const state=await getBookingState(client,req.user.id);
      if (!state.canAccept) {
        await client.query('ROLLBACK');
        return res.status(409).json({message:state.reason || 'No compatible shared seats are available'});
      }
    }
    const { rows: updated } = await client.query(
      'UPDATE drivers SET is_available = $1 WHERE user_id = $2 RETURNING is_available',
      [isAvailable, req.user.id],
    );
    await client.query('COMMIT');
    return res.json({ message: 'Availability updated', isAvailable: updated[0].is_available });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Availability error:', err);
    return res.status(500).json({ message: 'Could not update availability' });
  } finally {
    client.release();
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
