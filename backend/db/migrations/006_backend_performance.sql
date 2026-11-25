CREATE INDEX IF NOT EXISTS emergency_requests_created_status_idx
  ON emergency_requests (created_at DESC, status);

CREATE INDEX IF NOT EXISTS trips_status_updated_idx
  ON trips (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS location_history_recorded_idx
  ON location_history (recorded_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_created_idx
  ON audit_logs (action, created_at DESC);
