const pool = require('../config/db');

// Generate a 6-character alphanumeric safe-arrival code
const generateCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();
// GET /api/rides/available-cabs
const getAvailableCabs = async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Math.min(
    Math.max(Number(req.query.radius) || 10, 1),
    50
  );

  const bookingMode =
    req.query.bookingMode === 'Solo' ? 'Solo' : 'Sharing';

  const category = ['Standard', 'Medium', 'Gold'].includes(
    req.query.category
  )
    ? req.query.category
    : null;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return res.status(400).json({
      message: 'Valid lat and lng query parameters are required',
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         d.user_id AS driver_id,
         u.name AS driver_name,
         u.phone AS driver_phone,
         d.vehicle_details,
         d.seat_capacity,
         d.vehicle_category,
         d.current_lat AS latitude,
         d.current_lng AS longitude,
         (
           6371 * acos(
             LEAST(1, GREATEST(-1,
               cos(radians($1)) * cos(radians(d.current_lat)) *
               cos(radians(d.current_lng) - radians($2)) +
               sin(radians($1)) * sin(radians(d.current_lat))
             ))
           )
         ) AS distance_km,
         CASE
           WHEN $3 = 'Solo' THEN 0
           ELSE d.seat_capacity - COUNT(r.id)::INTEGER
         END AS seats_available
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN rides r
         ON r.driver_id = d.user_id
         AND r.status IN ('Pending', 'Active')
       WHERE u.role = 'Driver'
         AND d.vetting_status = 'Approved'
         AND d.current_lat IS NOT NULL
         AND d.current_lng IS NOT NULL
         AND (
           6371 * acos(
             LEAST(1, GREATEST(-1,
               cos(radians($1)) * cos(radians(d.current_lat)) *
               cos(radians(d.current_lng) - radians($2)) +
               sin(radians($1)) * sin(radians(d.current_lat))
             ))
           )
         ) <= $4
         AND ($5::VARCHAR IS NULL OR d.vehicle_category = $5)
       GROUP BY d.user_id, u.name, u.phone,
         d.vehicle_details, d.seat_capacity, d.vehicle_category,
         d.current_lat, d.current_lng
       HAVING
         (
           $3 = 'Solo'
           AND COUNT(r.id) = 0
           AND d.is_available = true
         )
         OR
         (
           $3 = 'Sharing'
           AND d.seat_capacity - COUNT(r.id)::INTEGER > 0
           AND (
             COUNT(r.id) = 0
             OR BOOL_AND(r.booking_mode = 'Sharing')
           )
         )
       ORDER BY distance_km ASC`,
      [lat, lng, bookingMode, radiusKm, category]
    );

    res.json(rows.map((cab) => ({
      driverId: cab.driver_id,
      driverName: cab.driver_name,
      driverPhone: cab.driver_phone,
      vehicleDetails: cab.vehicle_details,
      category: cab.vehicle_category,
      bookingMode,
      seatCapacity: Number(cab.seat_capacity),
      seatsAvailable: Number(cab.seats_available),
      distanceKm: Number(cab.distance_km),
      latitude: Number(cab.latitude),
      longitude: Number(cab.longitude),
    })));
  } catch (err) {
    console.error('Available cabs error:', err);
    res.status(500).json({
      message: 'Could not fetch available cabs',
      error: err.message,
    });
  }
};
// GET /api/rides/nearby-drivers
// Returns approved and available drivers near the passenger's location.
const getNearbyDrivers = async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Number(req.query.radius) || 10;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      message: 'lat and lng query parameters are required'
    });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      message: 'Invalid latitude or longitude'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        d.user_id AS id,
        u.name,
        u.phone,
        d.vehicle_details,
        d.current_lat AS latitude,
        d.current_lng AS longitude,
        d.last_location_update,

        (
          6371 * acos(
            LEAST(
              1,
              GREATEST(
                -1,
                cos(radians($1))
                * cos(radians(d.current_lat))
                * cos(radians(d.current_lng) - radians($2))
                + sin(radians($1))
                * sin(radians(d.current_lat))
              )
            )
          )
        ) AS distance_km

      FROM drivers d
      JOIN users u ON u.id = d.user_id

      WHERE u.role = 'Driver'
        AND d.vetting_status = 'Approved'
        AND d.is_available = true
        AND d.current_lat IS NOT NULL
        AND d.current_lng IS NOT NULL
        AND (
          6371 * acos(
            LEAST(
              1,
              GREATEST(
                -1,
                cos(radians($1))
                * cos(radians(d.current_lat))
                * cos(radians(d.current_lng) - radians($2))
                + sin(radians($1))
                * sin(radians(d.current_lat))
              )
            )
          )
        ) <= $3

      ORDER BY distance_km ASC
      LIMIT $4
      `,
      [lat, lng, radiusKm, limit]
    );

    const drivers = rows.map((driver) => ({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      vehicleDetails: driver.vehicle_details,
      latitude: Number(driver.latitude),
      longitude: Number(driver.longitude),
      distanceKm: Number(driver.distance_km),
      lastLocationUpdate: driver.last_location_update
    }));

    res.json(drivers);

  } catch (err) {
    console.error('Nearby drivers error:', err);

    res.status(500).json({
      message: 'Could not fetch nearby drivers',
      error: err.message
    });
  }
};
// Finds the nearest approved, available driver to a given point using the
// Haversine formula, computed directly in SQL so distance ranking happens
// in the database rather than pulling every driver row into Node.
const findNearestDriver = async (lat, lng) => {
  const { rows } = await pool.query(
    `SELECT
       d.user_id,
       d.current_lat,
       d.current_lng,
       (
         6371 * acos(
           cos(radians($1)) * cos(radians(d.current_lat)) *
           cos(radians(d.current_lng) - radians($2)) +
           sin(radians($1)) * sin(radians(d.current_lat))
         )
       ) AS distance_km
     FROM drivers d
     JOIN users u ON u.id = d.user_id
     WHERE u.role = 'Driver'
       AND d.vetting_status = 'Approved'
       AND d.is_available = true
       AND d.current_lat IS NOT NULL
       AND d.current_lng IS NOT NULL
     ORDER BY distance_km ASC
     LIMIT 1`,
    [lat, lng]
  );

  return rows[0] || null;
};

// POST /api/rides/book
const bookRide = async (req, res) => {
  const { pickup, dropoff, pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;

  if (!pickup || !dropoff) {
    return res.status(400).json({ message: 'Pickup and dropoff locations are required' });
  }
  if (typeof pickupLat !== 'number' || typeof pickupLng !== 'number') {
    return res.status(400).json({ message: 'pickupLat and pickupLng are required' });
  }

  try {
    const code = generateCode();
    const match = await findNearestDriver(pickupLat, pickupLng);

    const { rows } = await pool.query(
      `INSERT INTO rides
         (passenger_id, driver_id, pickup, dropoff, pickup_lat, pickup_lng,
          dropoff_lat, dropoff_lng, safe_arrival_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.user.id,
        match ? match.user_id : null,
        pickup,
        dropoff,
        pickupLat,
        pickupLng,
        dropoffLat || null,
        dropoffLng || null,
        code,
      ]
    );

    if (match) {
      await pool.query(
        `UPDATE drivers SET is_available = false WHERE user_id = $1`,
        [match.user_id]
      );
    }

    res.status(201).json({
      message: match ? 'Ride booked, driver assigned' : 'Ride booked, searching for a driver',
      ride: rows[0],
      driverAssigned: !!match,
      distanceKm: match ? Number(match.distance_km.toFixed(2)) : null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Booking failed', error: err.message });
  }
};

// POST /api/rides/safe-arrival/:id
const submitSafeArrival = async (req, res) => {
  const { id } = req.params;
  const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';

  if (!code) return res.status(400).json({ message: 'Safe-arrival code is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM rides
       WHERE id = $1 AND passenger_id = $2
       FOR UPDATE`,
      [id, req.user.id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found' });
    }

    const ride = rows[0];

    if (ride.safe_arrived || ride.status === 'Completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Safe arrival has already been confirmed' });
    }

    if (ride.status !== 'Active' || ride.driver_finished !== true) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Your driver must first confirm reaching the destination before you can confirm safe arrival.' });
    }

    if ((ride.safe_arrival_code || '').toUpperCase() !== code) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Incorrect safe arrival code' });
    }

    await client.query(
      `UPDATE rides
       SET safe_arrived = true, status = 'Completed'
       WHERE id = $1`,
      [id]
    );

    if (ride.driver_id) {
      await client.query(
       `UPDATE drivers SET is_available = true WHERE user_id = $1
 AND vetting_status = 'Approved'`,
        [ride.driver_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Safe arrival confirmed', driverAvailable: !!ride.driver_id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Safe arrival failed:', err);
    res.status(500).json({ message: 'Safe arrival failed', error: err.message });
  } finally {
    client.release();
  }
};

// GET /api/rides/my-rides
const myRides = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.*,
         u.name AS driver_name,
         u.phone AS driver_phone,
         d.vehicle_details,
         d.license_number
       FROM rides r
       LEFT JOIN users u ON r.driver_id = u.id
       LEFT JOIN drivers d ON d.user_id = r.driver_id
       WHERE r.passenger_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch rides', error: err.message });
  }
};

// POST /api/rides/emergency
const emergency = async (req, res) => {
  const { rideId } = req.body;

  try {
    if (rideId) {
      await pool.query(
       'UPDATE rides SET emergency_flag = true WHERE id = $1 AND passenger_id = $2',
        [rideId, req.user.id]
      );
    }
    // TODO: Twilio IRT alert integration
    res.json({ message: 'Emergency alert triggered', rideId: rideId || null });
  } catch (err) {
    res.status(500).json({ message: 'Emergency trigger failed', error: err.message });
  }
};

module.exports = {
  getNearbyDrivers,
  getAvailableCabs,
  bookRide,
  submitSafeArrival,
  myRides,
  emergency
};
