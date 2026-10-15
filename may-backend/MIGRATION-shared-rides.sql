-- Driver vehicle capacity and category
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS seat_capacity INTEGER NOT NULL DEFAULT 4;

ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(20)
NOT NULL DEFAULT 'Standard';

-- Booking mode and pricing category
ALTER TABLE rides
ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(20)
NOT NULL DEFAULT 'Sharing';

ALTER TABLE rides
ADD COLUMN IF NOT EXISTS pricing_category VARCHAR(20)
NOT NULL DEFAULT 'Standard';

ALTER TABLE rides
ADD COLUMN IF NOT EXISTS fare NUMERIC(10,2);

-- Shared trip grouping
ALTER TABLE rides
ADD COLUMN IF NOT EXISTS shared_trip_id UUID;

-- Track passenger destination arrival independently
ALTER TABLE rides
ADD COLUMN IF NOT EXISTS driver_finished BOOLEAN
NOT NULL DEFAULT FALSE;

-- Validate new values
ALTER TABLE drivers
ADD CONSTRAINT drivers_seat_capacity_check
CHECK (seat_capacity BETWEEN 1 AND 20);

ALTER TABLE drivers
ADD CONSTRAINT drivers_vehicle_category_check
CHECK (vehicle_category IN ('Standard', 'Medium', 'Gold'));

ALTER TABLE rides
ADD CONSTRAINT rides_booking_mode_check
CHECK (booking_mode IN ('Sharing', 'Solo'));

ALTER TABLE rides
ADD CONSTRAINT rides_pricing_category_check
CHECK (pricing_category IN ('Standard', 'Medium', 'Gold'));

-- Find active rides efficiently
CREATE INDEX IF NOT EXISTS idx_rides_driver_active
ON rides (driver_id, status);

CREATE INDEX IF NOT EXISTS idx_rides_shared_trip
ON rides (shared_trip_id);