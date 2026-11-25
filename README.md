# MediRoute – Smart Ambulance Tracking and Hospital Coordination System

> **Disclaimer:** MediRoute is an academic engineering demonstration project. In an actual medical emergency, please call your local official emergency telephone number (e.g. 112 / 911 / 108 / 999).

MediRoute is a full-stack emergency response coordination platform designed to bridge the critical gap between emergency callers, dispatch operators, ambulance response units, and emergency departments.

---

## 1. System Architecture & Tech Stack

```
                                  ┌─────────────────────────────┐
                                  │      React 19 + Vite        │
                                  │   (Tailored Role UI/UX)     │
                                  └──────────────┬──────────────┘
                                                 │ HTTP / REST + WSS (Socket.IO)
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │       Node.js + Express     │
                                  │ (JWT Auth, RBAC, Rate-Limit)│
                                  └──────────────┬──────────────┘
                                                 │ Parameterized Queries / PostGIS
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │    PostgreSQL 16 + PostGIS  │
                                  │  (Spatial GIST Indexing)    │
                                  └─────────────────────────────┘
```

- **Frontend:** React 19, Vite, Leaflet, React-Leaflet, Socket.IO client. Modular component architecture with code-splitting (`React.lazy`).
- **Backend:** Node.js, Express, Socket.IO, `compression`, `cors`, in-memory rate-limiter, custom HMAC-SHA256 authenticated token system.
- **Database:** PostgreSQL with PostGIS extension for spatial queries (`ST_DWithin`, `ST_Distance`, `ST_MakePoint`).
- **Road Routing:** OSRM (Open Source Routing Machine) for true street driving geometry and real-time turn points.
- **Deployment:** Docker Compose multi-container configuration.

---

## 2. Key Modules & Functional Capabilities

### A. Role-Based Dashboards & Access Control (RBAC)
1. **Administrator (`admin`)**:
   - High-level KPI operational stats.
   - Ambulance fleet & hospital registry management.
   - Audit logs and compliance export (CSV / JSON / PDF print).
   - Database retention cleanup (7-day automated purge).
2. **Control Room Operator (`control_room`)**:
   - Emergency intake & dispatch queue.
   - Interactive live map overview and incident routing.
   - OpenStreetMap live hospital and driver network synchronization.
3. **Ambulance Driver (`driver`)**:
   - Active trip assignment with patient condition and symptoms.
   - Direct hospital routing information and receiving facility contact phone.
   - Real-world device GPS streaming broadcast directly into the dispatch map.
   - Status updates: *Mark En Route*, *Arrived at Scene*, *Confirm Patient Handover*.
4. **Hospital Staff (`hospital_staff`)**:
   - Inbound ambulance monitor with estimated arrival time.
   - Incoming patient triage status, conscious/breathing state, and live vitals.
   - Real-time emergency department (ER) and ICU bed capacity management.
   - Admission and handover confirmation.

### B. Emergency Request & PostGIS Nearest Matching
- Reverse geocoding via OpenStreetMap Nominatim.
- Manual interactive map pin picker or one-click browser GPS detection.
- Emergency triage categories: Cardiology, Trauma, Neurology, General.
- Comprehensive patient intake: name, age, gender, contact number, symptoms, and optional vitals (HR, BP, SpO2, RR, Temp).
- Transaction-safe nearest ambulance and specialty-matched hospital assignment using `ST_Distance` and `FOR UPDATE SKIP LOCKED`.

### C. Live Telemetry & GPS Tracking
- **Actual GPS Mode:** Reads device GPS via `navigator.geolocation.watchPosition` and transmits authenticated telemetry to Socket.IO.
- **Simulation Mode:** Smooth interpolated road-following simulation along OSRM driving routes for demonstration and stress testing.
- Automatic breadcrumb recording in `location_history` table with PostGIS spatial points.

---

## 3. Getting Started

### Prerequisites
- Node.js 20+ installed
- PostgreSQL 15+ with PostGIS enabled (or Docker Desktop)

### Option A: Running with Docker Compose (Recommended)
```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Build and launch all services (Database + API + Frontend)
docker compose up --build

# Services will be accessible at:
# Frontend: http://localhost:5173
# Backend:  http://localhost:5000
# Database: localhost:5433
```

### Option B: Local Manual Setup

#### 1. Backend Setup
```bash
cd backend
npm install

# Run database migrations (001 through 007)
npm run db:migrate

# Seed demo data (sample hospitals & ambulances)
npm run db:seed

# Run unit tests
npm test

# Start the API server
npm start
```

#### 2. Frontend Setup
```bash
cd frontend
npm install

# Check code formatting & linting
npm run lint

# Build for production
npm run build

# Start local development server
npm run dev
```

---

## 4. Default Demo Credentials

For quick evaluation, the login screen includes one-click role presets:

| Role | Username | Password | Access Level |
|---|---|---|---|
| **Administrator** | `admin` | `Admin@1234` | Full system access, analytics, audit logs |
| **Control Room** | `operator1` | `Control@1234` | Emergency intake, dispatch, fleet monitor |
| **Ambulance Driver** | `driver1` | `Driver@1234` | Assigned trip navigation, GPS streaming |
| **Hospital Staff** | `hospital1` | `Hospital@1234` | Inbound patients, live ER/ICU bed updates |

---

## 5. Database Schema & Migrations

- `001_initial_schema.sql`: Base tables (`ambulances`, `hospitals`, `emergency_requests`, `trips`, `location_history`) with PostGIS spatial geography points and GIST indexes.
- `002_completed_requests.sql`: Adds completed/cancelled request status constraints.
- `003_authentication.sql`: Creates `control_room_users` with salted password hashing.
- `004_patient_vitals.sql`: Extends `emergency_requests` with patient details and vitals JSONB.
- `005_audit_logs.sql`: Security and administrative audit trail table.
- `006_backend_performance.sql`: Composite performance query indexes.
- `007_roles_and_links.sql`: Extended RBAC roles (`driver`, `hospital_staff`), driver-to-ambulance linkage (`driver_user_id`), and staff-to-hospital linkage (`hospital_id`).

---

## 6. Real-Time Socket.IO Protocol

All private events require a valid authenticated Bearer token in the handshake:

| Event | Direction | Description |
|---|---|---|
| `join_control_room` | Client ➔ Server | Joins the emergency dispatch broadcast room |
| `join_trip` | Client ➔ Server | Joins a specific trip room for live route updates |
| `driver_location_update` | Client ➔ Server | Driver sends live GPS position during active trip |
| `ambulance_driver_gps` | Client ➔ Server | Driver sends standby GPS location |
| `live_location` | Server ➔ Client | Emits coordinates & ETA to all tracking clients |
| `emergency_notification` | Server ➔ Client | Control room notification for new dispatches |
| `send_vitals` | Client ➔ Server | Paramedic streams patient vitals to receiving hospital |

---

## 7. Testing & Quality Assurance

- **Backend Unit Tests:** `npm --prefix backend test` (verifies password hashing, SOS payload validation, coordinate boundaries, vitals parsing, trip lifecycle transitions, and UUID schemas).
- **Frontend Code Quality:** `npm --prefix frontend run lint` (ESLint 10 with React 19 rules — **0 errors, 0 warnings**).
- **Frontend Production Build:** `npm --prefix frontend run build` (Vite production bundle generated in < 1 second with optimized chunk splitting).

---

## 8. License
Academic Demonstration License — developed for emergency coordination research.
