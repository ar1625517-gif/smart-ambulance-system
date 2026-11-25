ALTER TABLE emergency_requests
  ADD COLUMN IF NOT EXISTS patient_name TEXT,
  ADD COLUMN IF NOT EXISTS patient_age INTEGER
    CHECK (patient_age IS NULL OR (patient_age >= 0 AND patient_age <= 120)),
  ADD COLUMN IF NOT EXISTS patient_gender TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes TEXT,
  ADD COLUMN IF NOT EXISTS conscious BOOLEAN,
  ADD COLUMN IF NOT EXISTS breathing BOOLEAN,
  ADD COLUMN IF NOT EXISTS vitals JSONB NOT NULL DEFAULT '{}'::jsonb;
