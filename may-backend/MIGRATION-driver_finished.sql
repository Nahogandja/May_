-- Run once against the existing May PostgreSQL database.
-- Adds the driver arrival-confirmation state without changing existing ride statuses.
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS driver_finished BOOLEAN NOT NULL DEFAULT FALSE;
