-- Migration 007: Extended roles and resource linkage
-- Adds driver/hospital_staff roles, links ambulances to driver users,
-- links users to hospitals, and adds 'completed' to emergency_requests status.

-- 1. Extend role check to include driver and hospital_staff
ALTER TABLE control_room_users
  DROP CONSTRAINT IF EXISTS control_room_users_role_check;

ALTER TABLE control_room_users
  ADD CONSTRAINT control_room_users_role_check
    CHECK (role IN ('control_room', 'admin', 'driver', 'hospital_staff'));

-- 2. Add contact_phone to hospitals (optional info)
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- 3. Add driver_user_id to ambulances (nullable – not all ambulances have a linked user account)
ALTER TABLE ambulances
  ADD COLUMN IF NOT EXISTS driver_user_id UUID REFERENCES control_room_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ambulances_driver_user_idx ON ambulances (driver_user_id)
  WHERE driver_user_id IS NOT NULL;

-- 4. Add hospital_id to control_room_users so hospital_staff know which hospital they manage
ALTER TABLE control_room_users
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_hospital_idx ON control_room_users (hospital_id)
  WHERE hospital_id IS NOT NULL;

-- 5. Add 'completed' to emergency_requests status (was added in migration 002 but ensure it exists)
ALTER TABLE emergency_requests
  DROP CONSTRAINT IF EXISTS emergency_requests_status_check;

ALTER TABLE emergency_requests
  ADD CONSTRAINT emergency_requests_status_check
    CHECK (status IN ('pending', 'assigned', 'dispatched', 'unassigned', 'completed', 'cancelled'));

-- 6. Add 'dispatched' as an emergency_request status to track after ambulance assigned
-- (trips dispatched = request dispatched)
-- Note: existing 'assigned' maps to trip 'dispatched' in the lifecycle

-- 7. Index to find active trips by ambulance quickly
CREATE INDEX IF NOT EXISTS trips_active_ambulance_idx
  ON trips (ambulance_id)
  WHERE status NOT IN ('completed', 'cancelled');
