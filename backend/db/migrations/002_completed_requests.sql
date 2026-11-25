ALTER TABLE emergency_requests
  DROP CONSTRAINT IF EXISTS emergency_requests_status_check;

ALTER TABLE emergency_requests
  ADD CONSTRAINT emergency_requests_status_check
  CHECK (status IN ('pending', 'assigned', 'unassigned', 'cancelled', 'completed'));
