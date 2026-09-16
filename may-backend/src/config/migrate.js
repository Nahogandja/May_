require('dotenv').config();
const pool = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // USERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        email       VARCHAR(150) UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        phone       VARCHAR(20),
        role        VARCHAR(20) CHECK (role IN ('Admin','Driver','Passenger')) DEFAULT 'Passenger',
        is_verified BOOLEAN DEFAULT false,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // DRIVERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
        license_number       VARCHAR(50),
        vehicle_details      TEXT,
        vetting_status       VARCHAR(20) CHECK (vetting_status IN ('Pending','Approved','Rejected')) DEFAULT 'Pending',
        background_check     BOOLEAN DEFAULT false,
        psychological_report TEXT,
        approved_by          UUID REFERENCES users(id),
        created_at           TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // RIDES — 62-hour expiry aligns with research proposal data retention policy
    await client.query(`
      CREATE TABLE IF NOT EXISTS rides (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        passenger_id      UUID REFERENCES users(id),
        driver_id         UUID REFERENCES users(id),
        pickup            VARCHAR(255),
        dropoff           VARCHAR(255),
        status            VARCHAR(20) CHECK (status IN ('Pending','Active','Completed','Cancelled')) DEFAULT 'Pending',
        safe_arrival_code VARCHAR(10),
        safe_arrived      BOOLEAN DEFAULT false,
        emergency_flag    BOOLEAN DEFAULT false,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '62 hours'
      );
    `);

    await client.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION;
    `);

    await client.query('COMMIT');
    console.log('Migration complete: users, drivers, rides tables created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
