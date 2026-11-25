CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE ambulances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT NOT NULL UNIQUE,
  driver_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BLS', 'ALS')),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'busy', 'offline')),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ambulances_location_gix ON ambulances USING GIST (location);
CREATE INDEX ambulances_available_idx ON ambulances (status) WHERE status = 'available';

CREATE TABLE hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  er_beds_available INTEGER NOT NULL DEFAULT 0 CHECK (er_beds_available >= 0),
  icu_beds_available INTEGER NOT NULL DEFAULT 0 CHECK (icu_beds_available >= 0),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX hospitals_location_gix ON hospitals USING GIST (location);

CREATE TABLE emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_type TEXT NOT NULL
    CHECK (emergency_type IN ('Trauma', 'Cardiology', 'Neurology', 'General')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'unassigned', 'cancelled')),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES emergency_requests(id),
  ambulance_id UUID NOT NULL REFERENCES ambulances(id),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  status TEXT NOT NULL DEFAULT 'dispatched'
    CHECK (status IN ('dispatched', 'en_route', 'arrived', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trips_ambulance_status_idx ON trips (ambulance_id, status);

CREATE TABLE location_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ambulance_id UUID NOT NULL REFERENCES ambulances(id),
  trip_id UUID REFERENCES trips(id),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX location_history_ambulance_time_idx
  ON location_history (ambulance_id, recorded_at DESC);
CREATE INDEX location_history_location_gix ON location_history USING GIST (location);
