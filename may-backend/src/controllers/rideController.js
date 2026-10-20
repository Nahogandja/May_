const pool = require('../config/db');
const { randomUUID, randomInt } = require('node:crypto');
const { FARES, validCoordinate, kmBetween, eligibleForBooking } = require('../services/sharing');

// Cryptographically secure 6-character Safe Arrival codes.
const generateCode = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => letters[randomInt(letters.length)]).join('');
};

// GET /api/rides/available-cabs
// Pass dropoffLat/dropoffLng when searching for Sharing.
const getAvailableCabs = async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Number(req.query.radius ?? 10);
  const bookingMode = req.query.bookingMode || 'Solo';
  const category = req.query.category || 'Standard';
  const dropoffLat = Number(req.query.dropoffLat);
  const dropoffLng = Number(req.query.dropoffLng);

  if (!validCoordinate(lat, lng) || !Number.isFinite(radiusKm) ||
      radiusKm < 1 || radiusKm > 50) {
    return res.status(400).json({ message: 'Valid pickup coordinates and 1-50 km radius are required' });
  }
  if (!Object.hasOwn(FARES, bookingMode)) {
    return res.status(400).json({ message: 'Invalid booking mode' });
  }
  if (category !== 'Standard') {
    return res.status(400).json({ message: 'Only Standard taxis are available for the demo' });
  }
  if (bookingMode === 'Sharing' && !validCoordinate(dropoffLat, dropoffLng)) {
    return res.status(400).json({ message: 'Destination coordinates are required for Sharing' });
  }

  try {
    const { rows: drivers } = await pool.query(
      `SELECT d.user_id, u.name, d.vehicle_details,
              d.seat_capacity, d.vehicle_category, d.vetting_status,
              d.is_available, d.current_lat, d.current_lng
       FROM drivers d JOIN users u ON u.id = d.user_id
       WHERE u.role = 'Driver' AND d.vetting_status = 'Approved'
         AND d.is_available = TRUE AND d.vehicle_category = 'Standard'
         AND d.current_lat IS NOT NULL AND d.current_lng IS NOT NULL`,
    );

    const nearby = drivers.filter((driver) => kmBetween(
      lat, lng, Number(driver.current_lat), Number(driver.current_lng)) <= radiusKm);
    if (!nearby.length) return res.json([]);

    const { rows: rides } = await pool.query(
      `SELECT driver_id, status, booking_mode, shared_trip_id,
              pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
       FROM rides WHERE driver_id = ANY($1::uuid[])
         AND status IN ('Pending', 'Active')`,
      [nearby.map((d) => d.user_id)],
    );
    const requested = { pickupLat: lat, pickupLng: lng, dropoffLat, dropoffLng };
    const result = nearby.flatMap((driver) => {
      const unfinished = rides.filter((ride) => ride.driver_id === driver.user_id);
      if (!eligibleForBooking({ driver, unfinished, mode: bookingMode, requested })) return [];
      return [{
        driverId: driver.user_id,
        driverName: driver.name,
        vehicleDetails: driver.vehicle_details,
        category: driver.vehicle_category,
        bookingMode,
        seatCapacity: Number(driver.seat_capacity),
        seatsAvailable: bookingMode === 'Solo' ? Number(driver.seat_capacity) :
          Number(driver.seat_capacity) - unfinished.length,
        distanceKm: Number(kmBetween(lat, lng, Number(driver.current_lat),
          Number(driver.current_lng)).toFixed(2)),
        latitude: Number(driver.current_lat),
        longitude: Number(driver.current_lng),
        fare: FARES[bookingMode],
        joiningGroup: unfinished.length > 0,
      }];
    });
    result.sort((a, b) => a.distanceKm - b.distanceKm);
    return res.json(result);
  } catch (err) {
    console.error('Available cabs error:', err);
    return res.status(500).json({ message: 'Could not fetch available cabs' });
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
// POST /api/rides/book
const bookRide = async (req, res) => {
  const { pickup, dropoff, pickupLat, pickupLng, dropoffLat, dropoffLng,
    driverId, bookingMode, pricingCategory } = req.body || {};

  if (typeof pickup !== 'string' || !pickup.trim() ||
      typeof dropoff !== 'string' || !dropoff.trim()) {
    return res.status(400).json({ message: 'Pickup and destination are required' });
  }
  if (!validCoordinate(pickupLat, pickupLng) ||
      !validCoordinate(dropoffLat, dropoffLng)) {
    return res.status(400).json({ message: 'Valid pickup and destination coordinates are required' });
  }
  if (typeof driverId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(driverId)) {
    return res.status(400).json({ message: 'Please select a valid May taxi' });
  }
  if (!Object.hasOwn(FARES, bookingMode) || pricingCategory !== 'Standard') {
    return res.status(400).json({ message: 'Choose Standard Solo or Standard Sharing' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize requests by the same passenger, even when selecting different taxis.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const { rows: passengerBookings } = await client.query(
      `SELECT id FROM rides WHERE passenger_id = $1
       AND status IN ('Pending', 'Active') LIMIT 1`, [req.user.id],
    );
    if (passengerBookings.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'You already have an unfinished ride. Complete it before booking again.' });
    }
    // All reservations for one driver serialize through this row lock.
    const { rows: drivers } = await client.query(
      `SELECT d.user_id, d.is_available, d.vetting_status,
              d.vehicle_category, d.seat_capacity, d.current_lat, d.current_lng
       FROM drivers d JOIN users u ON u.id = d.user_id
       WHERE d.user_id = $1 AND u.role = 'Driver' FOR UPDATE OF d`,
      [driverId],
    );
    if (!drivers.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Selected taxi not found' });
    }

    const { rows: unfinished } = await client.query(
      `SELECT id, status, booking_mode, shared_trip_id,
              pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
       FROM rides WHERE driver_id = $1 AND status IN ('Pending', 'Active')`,
      [driverId],
    );
    const driver = drivers[0];
    const requested = { pickupLat, pickupLng, dropoffLat, dropoffLng };
    const eligible = eligibleForBooking({ driver, unfinished, mode: bookingMode, requested });
    // Also enforce the same pickup-radius rule as discovery, so direct API callers cannot bypass it.
    const nearPickup = driver.current_lat != null && driver.current_lng != null &&
      kmBetween(pickupLat, pickupLng, Number(driver.current_lat),
        Number(driver.current_lng)) <= 10;
    if (!eligible || !nearPickup) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This taxi is no longer available for the selected mode or route. Refresh available taxis.',
      });
    }

    const groupId = bookingMode === 'Sharing'
      ? (unfinished[0]?.shared_trip_id || randomUUID()) : null;
    const fare = FARES[bookingMode];
    const { rows } = await client.query(
      `INSERT INTO rides (
         passenger_id, driver_id, pickup, dropoff, pickup_lat, pickup_lng,
         dropoff_lat, dropoff_lng, safe_arrival_code,
         booking_mode, pricing_category, fare, shared_trip_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [req.user.id, driverId, pickup.trim(), dropoff.trim(), pickupLat, pickupLng,
        dropoffLat, dropoffLng, generateCode(), bookingMode, 'Standard', fare, groupId],
    );

    // Sharing taxi stays bookable until all seats are reserved, or the driver starts a ride.
    const remainingSeats = Number(driver.seat_capacity) - unfinished.length - 1;
    if (bookingMode === 'Solo' || remainingSeats <= 0) {
      await client.query('UPDATE drivers SET is_available = FALSE WHERE user_id = $1', [driverId]);
    }

    await client.query('COMMIT');
    return res.status(201).json({
      message: `${bookingMode} ride booked successfully`,
      ride: rows[0], driverAssigned: true,
      bookingMode, pricingCategory: 'Standard', fare,
      seatsRemaining: bookingMode === 'Sharing' ? Math.max(0, remainingSeats) : 0,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Booking failed:', err);
    return res.status(500).json({ message: 'Booking failed' });
  } finally {
    client.release();
  }
};

// POST /api/rides/safe-arrival/:id
const submitSafeArrival = async (req, res) => {
  const { id } = req.params;
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!code) return res.status(400).json({ message: 'Safe-arrival code is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock driver before ride: consistent lock ordering with booking and startRide.
    const { rows: owners } = await client.query(
      'SELECT driver_id FROM rides WHERE id = $1 AND passenger_id = $2',
      [id, req.user.id],
    );
    if (!owners.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found' });
    }
    const driverId = owners[0].driver_id;
    if (driverId) await client.query('SELECT user_id FROM drivers WHERE user_id = $1 FOR UPDATE', [driverId]);
    const { rows } = await client.query(
      'SELECT * FROM rides WHERE id = $1 AND passenger_id = $2 FOR UPDATE',
      [id, req.user.id],
    );
    const ride = rows[0];
    if (!ride || ride.safe_arrived || ride.status === 'Completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Safe arrival already confirmed' });
    }
    if (ride.status !== 'Active' || ride.driver_finished !== true) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Driver must confirm reaching your destination first' });
    }
    if ((ride.safe_arrival_code || '').toUpperCase() !== code) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Incorrect Safe Arrival Code' });
    }
    await client.query(
      `UPDATE rides SET safe_arrived = TRUE, status = 'Completed' WHERE id = $1`, [id],
    );

    let driverAvailable = false;
    if (driverId) {
      const { rows: remaining } = await client.query(
        `SELECT COUNT(*)::INTEGER AS total FROM rides
         WHERE driver_id = $1 AND status IN ('Pending', 'Active')`, [driverId],
      );
      if (remaining[0].total === 0) {
        const released = await client.query(
          `UPDATE drivers SET is_available = TRUE
           WHERE user_id = $1 AND vetting_status = 'Approved'
           RETURNING user_id`, [driverId],
        );
        driverAvailable = released.rows.length > 0;
      }
    }
    await client.query('COMMIT');
    return res.json({
      message: 'Safe arrival confirmed', driverAvailable,
      ...(driverId && !driverAvailable ? { note: 'Driver remains reserved until all passengers finish' } : {}),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Safe arrival failed:', err);
    return res.status(500).json({ message: 'Safe arrival failed' });
  } finally {
    client.release();
  }
};

// PATCH /api/rides/cancel/:id
// Passengers may cancel Pending rides. Started rides cannot be cancelled here.
const cancelRide = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const { rows: owners } = await client.query(
      'SELECT driver_id FROM rides WHERE id = $1 AND passenger_id = $2',
      [req.params.id, req.user.id],
    );
    if (!owners.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ride not found' });
    }
    const driverId = owners[0].driver_id;
    if (driverId) {
      await client.query('SELECT user_id FROM drivers WHERE user_id = $1 FOR UPDATE', [driverId]);
    }
    const { rows } = await client.query(
      'SELECT id, status FROM rides WHERE id = $1 AND passenger_id = $2 FOR UPDATE',
      [req.params.id, req.user.id],
    );
    if (rows[0]?.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Only Pending rides can be cancelled' });
    }
    await client.query(`UPDATE rides SET status = 'Cancelled' WHERE id = $1`, [req.params.id]);
    if (driverId) {
      const { rows: remaining } = await client.query(
        `SELECT status, booking_mode, shared_trip_id FROM rides
         WHERE driver_id = $1 AND status IN ('Pending','Active')`, [driverId],
      );
      const canReopen = !remaining.length ||
        remaining.every((r) => r.status === 'Pending' && r.booking_mode === 'Sharing' && r.shared_trip_id);
      if (canReopen) {
        await client.query(
          `UPDATE drivers SET is_available = TRUE
           WHERE user_id = $1 AND vetting_status = 'Approved'`, [driverId],
        );
      }
    }
    await client.query('COMMIT');
    return res.json({ message: 'Ride cancelled successfully' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Cancel ride error:', err);
    return res.status(500).json({ message: 'Could not cancel ride' });
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
  cancelRide,
  myRides,
  emergency
};
