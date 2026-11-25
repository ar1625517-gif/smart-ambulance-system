import { useState, useCallback, lazy, Suspense } from 'react';
import { loadAuth, saveAuth, clearAuth } from './services/authService';
import { NotificationPanel } from './components/NotificationPanel';
import { useNotifications } from './hooks/useNotifications';
import { useControlRoomSocket } from './hooks/useSocket';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { LoadingState } from './components/LoadingState';
import './App.css';

// Lazy load dashboard pages for code splitting & speed
const ControlRoomDashboard = lazy(() =>
  import('./pages/ControlRoomDashboard').then((m) => ({ default: m.ControlRoomDashboard }))
);
const EmergencyRequests = lazy(() =>
  import('./pages/EmergencyRequests').then((m) => ({ default: m.EmergencyRequests }))
);
const AmbulanceManagement = lazy(() =>
  import('./pages/AmbulanceManagement').then((m) => ({ default: m.AmbulanceManagement }))
);
const HospitalManagement = lazy(() =>
  import('./pages/HospitalManagement').then((m) => ({ default: m.HospitalManagement }))
);
const LiveTracking = lazy(() =>
  import('./pages/LiveTracking').then((m) => ({ default: m.LiveTracking }))
);
const Analytics = lazy(() =>
  import('./pages/Analytics').then((m) => ({ default: m.Analytics }))
);
const DriverDashboard = lazy(() =>
  import('./pages/DriverDashboard').then((m) => ({ default: m.DriverDashboard }))
);
const HospitalDashboard = lazy(() =>
  import('./pages/HospitalDashboard').then((m) => ({ default: m.HospitalDashboard }))
);

export function App() {
  const [session, setSession] = useState(() => loadAuth());
  const [view, setView] = useState('landing'); // 'landing' | 'login' | 'dashboard'
  const [currentTab, setCurrentTab] = useState(() => {
    const role = session?.user?.role;
    if (role === 'driver') return 'driver';
    if (role === 'hospital_staff') return 'hospital_staff';
    return 'dashboard';
  });
  const [trackedTripId, setTrackedTripId] = useState(null);
  const [trackedRequestId, setTrackedRequestId] = useState(null);

  // Notifications
  const {
    notifications,
    unread,
    panelOpen,
    alertMuted,
    permission,
    addNotification,
    toggleMute,
    requestPermission,
    openPanel,
    closePanel,
    clearAll
  } = useNotifications();

  // Socket connection for live notifications
  const { status: socketStatus } = useControlRoomSocket(
    session?.token,
    addNotification
  );

  const handleLoginSuccess = useCallback((token, user) => {
    saveAuth(token, user);
    setSession({ token, user });
    if (user.role === 'driver') {
      setCurrentTab('driver');
    } else if (user.role === 'hospital_staff') {
      setCurrentTab('hospital_staff');
    } else {
      setCurrentTab('dashboard');
    }
    setView('dashboard');
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setSession({ token: null, user: null });
    setView('landing');
    setCurrentTab('dashboard');
  }, []);

  const handleOpenDashboardFromLanding = useCallback(() => {
    if (session?.token) {
      setView('dashboard');
    } else {
      // Default to guest emergency or login
      setView('login');
    }
  }, [session?.token]);

  const handleTrackRequest = useCallback((requestId) => {
    setTrackedRequestId(requestId);
    setCurrentTab('tracking');
  }, []);

  const handleTrackTrip = useCallback((tripId, requestId) => {
    setTrackedTripId(tripId);
    setTrackedRequestId(requestId);
    setCurrentTab('tracking');
  }, []);

  // View 1: Landing Page
  if (view === 'landing') {
    return (
      <LandingPage
        onOpenDashboard={handleOpenDashboardFromLanding}
        onOpenLogin={() => setView('login')}
      />
    );
  }

  // View 2: Login Page
  if (view === 'login') {
    return (
      <LoginPage
        onBack={() => setView('landing')}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // View 3: Protected Role-Based Dashboard App Shell
  return (
    <DashboardLayout
      user={session?.user}
      onLogout={handleLogout}
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      socketStatus={socketStatus}
      notificationsCount={unread}
      onOpenNotifications={openPanel}
      alertMuted={alertMuted}
      onToggleMute={toggleMute}
    >
      {panelOpen && (
        <NotificationPanel
          notifications={notifications}
          connection={socketStatus}
          onClose={closePanel}
          onClear={clearAll}
          alertMuted={alertMuted}
          onToggleMute={toggleMute}
          onRequestPermission={requestPermission}
          notificationPermission={permission}
        />
      )}

      <Suspense fallback={<LoadingState message="Loading module..." size="lg" />}>
        {currentTab === 'dashboard' && (
          <ControlRoomDashboard
            token={session?.token}
            user={session?.user}
            onSelectRequest={handleTrackRequest}
            onNavigateTab={setCurrentTab}
          />
        )}

        {currentTab === 'emergency' && (
          <EmergencyRequests
            onViewTripTracking={handleTrackTrip}
          />
        )}

        {currentTab === 'tracking' && (
          <LiveTracking
            token={session?.token}
            initialRequestId={trackedRequestId}
            initialTripId={trackedTripId}
          />
        )}

        {currentTab === 'ambulances' && (
          <AmbulanceManagement
            token={session?.token}
            user={session?.user}
          />
        )}

        {currentTab === 'hospitals' && (
          <HospitalManagement
            token={session?.token}
            user={session?.user}
          />
        )}

        {currentTab === 'analytics' && session?.user?.role === 'admin' && (
          <Analytics
            token={session?.token}
          />
        )}

        {currentTab === 'driver' && (
          <DriverDashboard
            token={session?.token}
            user={session?.user}
          />
        )}

        {currentTab === 'hospital_staff' && (
          <HospitalDashboard
            token={session?.token}
            user={session?.user}
          />
        )}
      </Suspense>
    </DashboardLayout>
  );
}

export default App;
