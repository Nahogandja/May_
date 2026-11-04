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

    // Driver must confirm destination arrival before the passenger submits the safe-arrival code.
    await client.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS driver_finished BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // ES4WOMEN&CHILDREN: track when the driver marks arrival; rotate an unused code
    // once after five minutes, never without an explicit passenger confirmation.
    await client.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS driver_finished_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS arrival_code_rotated_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_ride_arrival_code_due
        ON rides(driver_finished_at)
        WHERE driver_finished = TRUE AND safe_arrived = FALSE AND status = 'Active';
    `);

    // MAY academic demo: Sharing/Solo metadata (safe to run on existing databases).
    await client.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS seat_capacity INTEGER NOT NULL DEFAULT 4,
        ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(20) NOT NULL DEFAULT 'Standard';
    `);
    await client.query(`
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(20) NOT NULL DEFAULT 'Sharing',
        ADD COLUMN IF NOT EXISTS pricing_category VARCHAR(20) NOT NULL DEFAULT 'Standard',
        ADD COLUMN IF NOT EXISTS fare NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS shared_trip_id UUID;
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_seat_capacity_check'
                       AND conrelid = 'drivers'::regclass) THEN
          ALTER TABLE drivers ADD CONSTRAINT drivers_seat_capacity_check
            CHECK (seat_capacity BETWEEN 1 AND 20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_vehicle_category_check'
                       AND conrelid = 'drivers'::regclass) THEN
          ALTER TABLE drivers ADD CONSTRAINT drivers_vehicle_category_check
            CHECK (vehicle_category IN ('Standard', 'Medium', 'Gold'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_booking_mode_check'
                       AND conrelid = 'rides'::regclass) THEN
          ALTER TABLE rides ADD CONSTRAINT rides_booking_mode_check
            CHECK (booking_mode IN ('Sharing', 'Solo'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_pricing_category_check'
                       AND conrelid = 'rides'::regclass) THEN
          ALTER TABLE rides ADD CONSTRAINT rides_pricing_category_check
            CHECK (pricing_category IN ('Standard', 'Medium', 'Gold'));
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rides_driver_active ON rides(driver_id, status);
      CREATE INDEX IF NOT EXISTS idx_rides_shared_trip ON rides(shared_trip_id);
    `);

    // IRT academic demo: persistent, auditable SOS incidents.
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ride_id UUID NOT NULL REFERENCES rides(id),
        passenger_id UUID NOT NULL REFERENCES users(id),
        driver_id UUID REFERENCES users(id),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        location_source VARCHAR(20) NOT NULL DEFAULT 'unavailable'
          CHECK (location_source IN ('last_known', 'pickup', 'unavailable')),
        status VARCHAR(20) NOT NULL DEFAULT 'Open'
          CHECK (status IN ('Open', 'Acknowledged', 'Resolved')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        acknowledged_at TIMESTAMPTZ,
        acknowledged_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        resolved_by UUID REFERENCES users(id),
        resolution_note VARCHAR(500)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emergency_status_created
        ON emergency_alerts(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_emergency_ride_created
        ON emergency_alerts(ride_id, created_at DESC);
    `);

    // Wallet academic demo: immutable-looking audit ledger and integer-cent balances.
    // These are DEMO credits only; no real MoMo or bank transfers occur.
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES wallets(user_id) ON DELETE CASCADE,
        ride_id UUID REFERENCES rides(id),
        entry_type VARCHAR(24) NOT NULL CHECK (entry_type IN
          ('demo_topup', 'ride_payment', 'ride_refund', 'driver_earning')),
        amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
        channel VARCHAR(12) CHECK (channel IN ('MoMo', 'Card')),
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ride_action
        ON wallet_transactions(user_id, ride_id, entry_type)
        WHERE ride_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_wallet_history
        ON wallet_transactions(user_id, created_at DESC);
    `);

    // MAY safety & identity migration. Existing accounts remain valid.
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(25),
        ADD COLUMN IF NOT EXISTS gender VARCHAR(30);
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS vehicle_color VARCHAR(50),
        ADD COLUMN IF NOT EXISTS plate_number VARCHAR(30),
        ADD COLUMN IF NOT EXISTS headshot_url TEXT;
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS planned_route JSONB,
        ADD COLUMN IF NOT EXISTS route_steps JSONB,
        ADD COLUMN IF NOT EXISTS route_source VARCHAR(24) DEFAULT 'unavailable',
        ADD COLUMN IF NOT EXISTS last_driver_lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS last_driver_lng DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS last_driver_move_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_destination_km DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS deviation_samples INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS wrong_direction_samples INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS safety_status VARCHAR(25) NOT NULL DEFAULT 'Normal',
        ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating BETWEEN 1 AND 5),
        ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;
      ALTER TABLE emergency_alerts
        ADD COLUMN IF NOT EXISTS affected_parties VARCHAR(15) NOT NULL DEFAULT 'Passenger',
        ADD COLUMN IF NOT EXISTS emergency_contact_sms_status VARCHAR(30) NOT NULL DEFAULT 'not_configured',
        ADD COLUMN IF NOT EXISTS driver_contact_sms_status VARCHAR(30) NOT NULL DEFAULT 'not_configured',
        ADD COLUMN IF NOT EXISTS contact_called_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS police_called_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS escalation_note TEXT,
        ADD COLUMN IF NOT EXISTS reported_by_id UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS reported_by_role VARCHAR(16) NOT NULL DEFAULT 'Passenger';
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ride_safety_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
        passenger_id UUID NOT NULL REFERENCES users(id),
        driver_id UUID REFERENCES users(id),
        reason VARCHAR(30) NOT NULL CHECK (reason IN ('off_route', 'idle', 'wrong_direction')),
        status VARCHAR(30) NOT NULL DEFAULT 'AwaitingPassenger'
          CHECK (status IN ('AwaitingPassenger', 'AwaitingAdmin', 'NeedsHelp', 'CodeRotated', 'Resolved')),
        passenger_safe BOOLEAN,
        passenger_response_at TIMESTAMPTZ,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unresolved_safety_ride
        ON ride_safety_alerts(ride_id)
        WHERE status IN ('AwaitingPassenger', 'AwaitingAdmin', 'NeedsHelp');
      CREATE INDEX IF NOT EXISTS idx_safety_admin ON ride_safety_alerts(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rides_frequent_places ON rides(passenger_id, status, created_at DESC);
    `);
    // ES4WAC: private driver verification, scheduling and authenticated trip messages.
    await client.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS certified_id_path TEXT,
        ADD COLUMN IF NOT EXISTS certified_licence_path TEXT,
        ADD COLUMN IF NOT EXISTS documents_reviewed_at TIMESTAMPTZ;
      ALTER TABLE rides
        ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_scheduled_driver
        ON rides(driver_id, scheduled_for) WHERE scheduled_for IS NOT NULL AND status IN ('Pending', 'Active');
      CREATE TABLE IF NOT EXISTS ride_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body VARCHAR(1200) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ride_messages_created
        ON ride_messages(ride_id, created_at ASC);
    `);
    // Auditable, restart-safe SMS reminders. No phone numbers are duplicated here.
    await client.query(`
      CREATE TABLE IF NOT EXISTS ride_reminders (
        ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
        recipient_role VARCHAR(12) NOT NULL CHECK (recipient_role IN ('Passenger','Driver')),
        status VARCHAR(12) NOT NULL DEFAULT 'Pending'
          CHECK (status IN ('Pending','Sending','Submitted','Skipped')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ,
        last_error TEXT,
        PRIMARY KEY (ride_id,recipient_role)
      );
      CREATE INDEX IF NOT EXISTS idx_rides_upcoming_reminder
        ON rides(scheduled_for) WHERE scheduled_for IS NOT NULL AND status='Pending';
    `);
    // Authenticated push registrations and Expo receipt tracking.
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_device_tokens (
        token TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(12) NOT NULL DEFAULT 'android',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user ON push_device_tokens(user_id);
      CREATE TABLE IF NOT EXISTS push_delivery_receipts (
        receipt_id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checked_at TIMESTAMPTZ,
        status VARCHAR(20),
        error TEXT
      );
      ALTER TABLE ride_reminders
        ADD COLUMN IF NOT EXISTS delivery_channel VARCHAR(10);
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
