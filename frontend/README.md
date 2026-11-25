# MediRoute Frontend Application

The MediRoute frontend is a responsive React 19 + Vite web application built for healthcare emergency dispatch, ambulance crew navigation, and hospital coordination.

---

## 1. Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Check code quality (zero ESLint errors)
npm run lint

# 3. Create production build
npm run build

# 4. Start local development server
npm run dev
```

Default development server runs at `http://localhost:5173`.

---

## 2. Environment Variables

Create `.env` from `.env.example`:
```ini
VITE_API_BASE_URL=http://localhost:5000
```

---

## 3. Modular Architecture

```
frontend/src/
├── assets/
│   └── hero.png                     # Visual hero asset for landing page
├── components/
│   ├── ConfirmDialog.jsx            # Accessible confirmation dialog modal
│   ├── DataTable.jsx                # Reusable table with client-side sorting & pagination
│   ├── LoadingState.jsx             # Spinners, empty states, and error alerts
│   ├── NotificationPanel.jsx        # Slide-in emergency alert notification center
│   ├── StatCard.jsx                 # Dashboard KPI metric cards
│   └── StatusBadge.jsx              # Color-coded status pills with live indicators
├── hooks/
│   ├── useGeolocation.js            # Geolocation single-shot and continuous watch
│   ├── useNotifications.js          # Web Audio siren + Web Notifications API
│   └── useSocket.js                 # Socket.IO connection & auto-reconnect hook
├── layouts/
│   └── DashboardLayout.jsx          # Responsive shell with role-based sidebar & topbar
├── pages/
│   ├── AmbulanceManagement.jsx      # Fleet CRUD & driver live GPS broadcast console
│   ├── Analytics.jsx                # Administrative graphs, CSV/JSON exports, audit log
│   ├── ControlRoomDashboard.jsx     # Overview KPIs, real-world sync tool, recent requests
│   ├── DriverDashboard.jsx          # Crew mobile console: assigned trip & status updater
│   ├── EmergencyRequests.jsx        # SOS triage form, GPS detection, map picker
│   ├── HospitalDashboard.jsx        # Hospital staff console: inbound patients & bed editor
│   ├── HospitalManagement.jsx       # Hospital directory & capacity configuration
│   ├── LandingPage.jsx              # Public landing page with live network map
│   ├── LiveTracking.jsx             # Dedicated Leaflet + OSRM routing telemetry view
│   └── LoginPage.jsx                # Staff authentication with quick role presets
├── services/
│   ├── api.js                       # Centralized API service with Bearer auth headers
│   └── authService.js               # Token storage & session persistence
├── App.css                          # Modern healthcare design system & responsive rules
├── App.jsx                          # Main router & session state coordinator
├── main.jsx                         # React 19 DOM root mount
└── MapViews.jsx                     # Leaflet / React-Leaflet OSRM routing & marker icons
```

---

## 4. Role Navigation Map

- **Administrator**: Dashboard, Emergency SOS, Live Tracking, Ambulances, Hospitals, Analytics & Logs.
- **Control Room Operator**: Dashboard, Emergency SOS, Live Tracking, Ambulances, Hospitals.
- **Ambulance Driver**: My Assignment, GPS Transmission.
- **Hospital Staff**: Hospital Incoming, Capacity Management.

---

## 5. Verification Commands

- `npm run lint` — Validates all files against ESLint 10 + React Hooks 7 rules.
- `npm run build` — Compiles production chunks with gzip compression output.
- `npm run preview` — Serves production build locally for testing.
