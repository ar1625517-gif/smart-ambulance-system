# MediRoute Backend Service

The MediRoute backend is a Node.js + Express API server with PostgreSQL/PostGIS persistence, Socket.IO real-time event broadcasting, token authentication, role-based access control (RBAC), and in-memory rate limiting.

---

## 1. Environment Configuration

Copy `backend/.env.example` to `backend/.env` and configure:
```ini
PORT=5000
DATABASE_URL=postgresql://ambulance_demo:local_demo_password@localhost:5433/ambulance_db
AUTH_SECRET=your-secure-random-hmac-secret-key-min-32-chars
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

---

## 2. Database Migrations

Migrations are strictly sequential SQL files in `db/migrations/`:
1. `001_initial_schema.sql` — PostGIS extensions, tables (`ambulances`, `hospitals`, `emergency_requests`, `trips`, `location_history`), spatial GIST indexes.
2. `002_completed_requests.sql` — Adds `completed` / `cancelled` request statuses.
3. `003_authentication.sql` — Control room user authentication table with scrypt hashing.
4. `004_patient_vitals.sql` — Patient demographics and JSONB vitals fields.
5. `005_audit_logs.sql` — Comprehensive audit trails table.
6. `006_backend_performance.sql` — Query performance composite indexes.
7. `007_roles_and_links.sql` — Support for `driver` and `hospital_staff` roles, driver-to-ambulance links, staff-to-hospital links.

Apply migrations:
```bash
npm run db:migrate
```

Seed demo records (15+ hospitals and ambulances):
```bash
npm run db:seed
```

---

## 3. Core API Endpoints

### Authentication & User Management (`/api/auth`)
- `POST /api/auth/login` — Sign in and receive an HMAC-SHA256 authenticated token.
- `GET /api/auth/me` — Inspect currently signed-in user session.
- `GET /api/auth/users` — List system users (Admin only).
- `POST /api/auth/users` — Create new staff account with role (Admin only).
- `PATCH /api/auth/users/:id` — Update user status / role (Admin only).

### Dispatch Operations (`/api/dispatch`)
- `POST /api/dispatch/sos` — Submit emergency request; executes transactional PostGIS nearest-search for available ambulance and specialty hospital.
- `GET /api/dispatch/dashboard` — Live counts (active trips, available units, ER beds, daily requests).
- `GET /api/dispatch/map-overview` — Fleet overview data for map rendering.
- `GET /api/dispatch/requests` — Paginated list of emergency requests.
- `GET /api/dispatch/requests/:requestId` — Inspect details of a single emergency request.
- `GET /api/dispatch/trips` — List active and historical trips with status filter.
- `GET /api/dispatch/trips/:tripId` — Get trip details.
- `GET /api/dispatch/trips/:tripId/history` — Location breadcrumb history.
- `PATCH /api/dispatch/trips/:tripId/status` — Advance trip lifecycle status (`dispatched` ➔ `en_route` ➔ `arrived` ➔ `completed` / `cancelled`).
- `POST /api/dispatch/trips/:tripId/auto-status` — Automated step forward in trip lifecycle.
- `POST /api/dispatch/trips/:tripId/gps/reset` — Reset breadcrumb path for demonstration.

### Management & Coordination (`/api/management`)
- `GET /api/management/resources` — List all registered ambulances and hospitals.
- `POST /api/management/ambulances` — Register ambulance (Admin / Control Room).
- `PATCH /api/management/ambulances/:id/status` — Update ambulance readiness (`available`, `busy`, `offline`).
- `DELETE /api/management/ambulances/:id` — Delete ambulance (Admin only).
- `POST /api/management/hospitals` — Register hospital (Admin / Control Room).
- `PATCH /api/management/hospitals/:id/beds` — Update ER and ICU bed capacity.
- `DELETE /api/management/hospitals/:id` — Delete hospital (Admin only).
- `POST /api/management/sync-real-world` — Fetch live hospitals and populate ambulances from OpenStreetMap / Nominatim.
- `GET /api/management/driver/assignment` — Active trip assigned to logged-in driver.
- `GET /api/management/hospital/incoming` — Inbound ambulances for logged-in hospital staff.

### Analytics & Reports (`/api/admin`)
- `GET /api/admin/analytics` — Detailed operational metrics and 7-day request history.
- `GET /api/admin/audit` — Audit logs query.
- `POST /api/admin/maintenance/retention` — Purge stale records older than N days.
- `GET /api/admin/reports/incidents.csv` — Download incident log.
- `GET /api/admin/reports/resources.csv` — Download fleet & hospital directory.
- `GET /api/admin/reports/audit.csv` — Download audit logs.
- `GET /api/admin/reports/backup.json` — Complete database JSON backup.

---

## 4. Socket.IO Telemetry Events
- `join_control_room` — Operator room subscription (Auth required).
- `join_trip` — Individual trip telemetry subscription (Auth required).
- `driver_location_update` — Driver transmits GPS; recorded in `location_history` and broadcasted to tracking room.
- `ambulance_driver_gps` — Driver transmits standby GPS; updates ambulance table location.
- `send_vitals` — Paramedic transmits patient telemetry to hospital.

---

## 5. Automated Tests
```bash
npm test
```
Runs Node.js native test runner verifying security validation, password hashing, coordinate boundaries, vitals schema, and trip lifecycle constraints.
