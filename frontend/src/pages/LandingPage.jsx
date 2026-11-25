import { memo, useState, useEffect, Suspense, lazy } from 'react';
import heroImage from '../assets/hero.png';
import { dispatchApi } from '../services/api';

const OverviewMap = lazy(() =>
  import('../MapViews.jsx').then((module) => ({ default: module.OverviewMap }))
);

export const LandingPage = memo(function LandingPage({ onOpenDashboard, onOpenLogin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [landingStats, setLandingStats] = useState(null);
  const [overviewVisible, setOverviewVisible] = useState(false);
  const [overviewMap, setOverviewMap] = useState({
    ambulances: [],
    hospitals: [],
    incidents: [],
    refreshedAt: null
  });

  useEffect(() => {
    let active = true;
    async function loadStats() {
      try {
        const data = await dispatchApi.dashboard();
        if (active && data?.stats) setLandingStats(data.stats);
      } catch {
        if (active) setLandingStats(null);
      }
    }
    loadStats();
    const timer = setInterval(() => {
      if (!document.hidden) loadStats();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const overviewSection = document.getElementById('network');
    if (!overviewSection) return undefined;

    if (!('IntersectionObserver' in window)) {
      const fallbackTimer = setTimeout(() => setOverviewVisible(true), 0);
      return () => clearTimeout(fallbackTimer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setOverviewVisible(true);
      },
      { rootMargin: '300px' }
    );
    observer.observe(overviewSection);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!overviewVisible) return undefined;
    let active = true;
    async function loadOverview() {
      try {
        const data = await dispatchApi.mapOverview();
        if (active) setOverviewMap(data);
      } catch {
        if (active) setOverviewMap({ ambulances: [], hospitals: [], incidents: [] });
      }
    }
    loadOverview();
    const timer = setInterval(() => {
      if (!document.hidden) loadOverview();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [overviewVisible]);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <div className="website">
      <nav className="navbar">
        <div className="brand" onClick={() => scrollTo('home')} style={{ cursor: 'pointer' }}>
          <span className="brand-icon">✚</span>
          <span>MediRoute</span>
        </div>

        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>

        <div className={`nav-links ${menuOpen ? 'show' : ''}`}>
          <a onClick={() => scrollTo('home')}>Home</a>
          <a onClick={() => scrollTo('features')}>Features</a>
          <a onClick={() => scrollTo('network')}>Live Network</a>
          <a onClick={() => scrollTo('about')}>About</a>
          <a onClick={onOpenLogin} style={{ cursor: 'pointer', color: '#1a56db', fontWeight: 600 }}>
            Staff Login
          </a>
        </div>

        <button className="nav-button" onClick={onOpenDashboard}>
          Emergency Dispatch →
        </button>
      </nav>

      <main>
        <section className="hero" id="home">
          <div className="hero-content">
            <span className="eyebrow">● SMART EMERGENCY RESPONSE SYSTEM</span>
            <h1>
              Every Second
              <br />
              <span>Can Save a Life.</span>
            </h1>
            <p>
              Smarter ambulance dispatch, faster hospital coordination,
              and real-time emergency response — all in one place.
            </p>

            <div className="hero-actions">
              <button className="primary-button" onClick={onOpenDashboard}>
                🚨 Get Emergency Assistance
              </button>
              <button className="secondary-button" onClick={() => scrollTo('features')}>
                Explore Our System →
              </button>
            </div>

            <div className="hero-trust">
              <span>✓ Smart dispatch</span>
              <span>✓ Hospital coordination</span>
              <span>✓ Live tracking</span>
            </div>

            {landingStats && (
              <div className="landing-live-stats" aria-label="Live system status">
                <article>
                  <strong>{landingStats.available_ambulances}</strong>
                  <span>Ambulances ready</span>
                </article>
                <article>
                  <strong>{landingStats.active_trips}</strong>
                  <span>Active responses</span>
                </article>
                <article>
                  <strong>{landingStats.er_beds_available}</strong>
                  <span>ER beds available</span>
                </article>
              </div>
            )}
          </div>

          <div className="hero-visual">
            <div className="visual-glow"></div>
            <div className="ambulance-card">
              <div className="ambulance-top">
                <span>LIVE RESPONSE</span>
                <span className="live-dot">● LIVE</span>
              </div>
              <div className="ambulance-art">
                <img src={heroImage} alt="MediRoute smart ambulance system" />
              </div>
              <div className="tracking-line">
                <span></span>
                <div>
                  <strong>Emergency response</strong>
                  <small>Smart ambulance coordination</small>
                </div>
              </div>
              <div className="visual-bottom">
                <span>FAST</span>
                <span>CONNECTED</span>
                <span>RELIABLE</span>
              </div>
            </div>

            <div className="floating-card floating-one">
              <span>🏥</span>
              <div>
                <strong>Hospital Network</strong>
                <small>Connected care</small>
              </div>
            </div>

            <div className="floating-card floating-two">
              <span>📍</span>
              <div>
                <strong>Live Location</strong>
                <small>Location monitoring</small>
              </div>
            </div>
          </div>
        </section>

        <section className="quick-info">
          <div>
            <strong>01</strong>
            <span>Smart Ambulance Dispatch</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Hospital Matching</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Emergency Coordination</span>
          </div>
        </section>

        <section className="overview-map-section" id="network">
          <div className="section-heading">
            <span className="eyebrow">LIVE NETWORK OVERVIEW</span>
            <h2>Emergency resources <span>at a glance.</span></h2>
            <p>
              Live map of active incidents, available response units,
              and connected hospitals.
            </p>
          </div>
          <div className="overview-map">
            <div className="overview-map-legend">
              <span><i className="legend-incident"></i> Incidents</span>
              <span><i className="legend-ambulance"></i> Ambulances</span>
              <span><i className="legend-hospital"></i> Hospitals</span>
            </div>
            <div className="overview-map-meta">
              <span>● Live data</span>
              {overviewMap.refreshedAt && (
                <small>
                  Updated {new Date(overviewMap.refreshedAt).toLocaleTimeString()}
                </small>
              )}
            </div>
            <Suspense fallback={<div className="map-loading">Loading network map...</div>}>
              {overviewVisible && <OverviewMap data={overviewMap} />}
            </Suspense>
          </div>
        </section>

        <section className="features section" id="features">
          <div className="section-heading">
            <span className="eyebrow">OUR CAPABILITIES</span>
            <h2>Emergency care, <span>reimagined.</span></h2>
            <p>
              Technology that helps emergency teams coordinate essential services more efficiently.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <div className="feature-icon blue">🚑</div>
              <h3>Smart Ambulance Dispatch</h3>
              <p>
                Identify and assign available ambulances based on emergency location and proximity.
              </p>
              <span>01 / DISPATCH</span>
            </article>

            <article className="feature-card">
              <div className="feature-icon red">🏥</div>
              <h3>Hospital Coordination</h3>
              <p>
                Find suitable hospitals based on emergency requirements and available emergency beds.
              </p>
              <span>02 / HOSPITALS</span>
            </article>

            <article className="feature-card">
              <div className="feature-icon green">📍</div>
              <h3>Live Trip Monitoring</h3>
              <p>
                Support ambulance location updates and trip monitoring through connected telemetry services.
              </p>
              <span>03 / TRACKING</span>
            </article>
          </div>
        </section>

        <section className="about-section" id="about">
          <div className="about-visual">
            <div className="about-symbol">✚</div>
            <div className="about-caption">
              <strong>Connected Emergency Care</strong>
              <span>One coordinated response system</span>
            </div>
          </div>

          <div className="about-content">
            <span className="eyebrow">WHY MEDIROUTE?</span>
            <h2>Bringing emergency services closer together.</h2>
            <p>
              MediRoute is designed to improve coordination between emergency requests,
              ambulance services, and hospitals. It brings important dispatch information
              into one connected platform.
            </p>

            <div className="about-point">✓ Location-based ambulance selection</div>
            <div className="about-point">✓ Emergency-type-based hospital matching</div>
            <div className="about-point">✓ Connected trip updates & live OSRM routing</div>
          </div>
        </section>

        <section className="emergency-section" id="emergency">
          <span className="eyebrow">NEED EMERGENCY ASSISTANCE?</span>
          <h2>Get connected to emergency response.</h2>
          <p>
            Continue to our emergency dashboard to submit a request
            and view ambulance dispatch information.
          </p>
          <button className="emergency-button" onClick={onOpenDashboard}>
            Open Emergency Dashboard →
          </button>
          <small>
            Academic demonstration project · Use verified local emergency numbers (e.g., 112 / 911 / 108) for real emergencies.
          </small>
        </section>
      </main>

      <footer className="footer" id="contact">
        <div className="brand">
          <span className="brand-icon">✚</span>
          <span>MediRoute</span>
        </div>
        <p>Smarter coordination. Faster emergency response.</p>
        <span>© 2026 MediRoute · Smart Ambulance System</span>
      </footer>
    </div>
  );
});
