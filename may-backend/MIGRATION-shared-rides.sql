-- OPTIONAL: for existing databases. `npm run migrate` now applies these changes too.
-- This script is repeatable: constraints are checked before creation.
BEGIN;
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS seat_capacity INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(20) NOT NULL DEFAULT 'Standard';
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(20) NOT NULL DEFAULT 'Sharing',
  ADD COLUMN IF NOT EXISTS pricing_category VARCHAR(20) NOT NULL DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS fare NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS shared_trip_id UUID,
  ADD COLUMN IF NOT EXISTS driver_finished BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='drivers_seat_capacity_check' AND conrelid='drivers'::regclass) THEN
    ALTER TABLE drivers ADD CONSTRAINT drivers_seat_capacity_check CHECK (seat_capacity BETWEEN 1 AND 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='drivers_vehicle_category_check' AND conrelid='drivers'::regclass) THEN
    ALTER TABLE drivers ADD CONSTRAINT drivers_vehicle_category_check CHECK (vehicle_category IN ('Standard','Medium','Gold'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rides_booking_mode_check' AND conrelid='rides'::regclass) THEN
    ALTER TABLE rides ADD CONSTRAINT rides_booking_mode_check CHECK (booking_mode IN ('Sharing','Solo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rides_pricing_category_check' AND conrelid='rides'::regclass) THEN
    ALTER TABLE rides ADD CONSTRAINT rides_pricing_category_check CHECK (pricing_category IN ('Standard','Medium','Gold'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_rides_driver_active ON rides(driver_id,status);
CREATE INDEX IF NOT EXISTS idx_rides_shared_trip ON rides(shared_trip_id);
COMMIT;
