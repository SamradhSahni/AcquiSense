import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import LandingPage from './pages/LandingPage/LandingPage';
import Dashboard from './pages/Dashboard/Dashboard';
import NewDeal from './pages/NewDeal/NewDeal';
import DealView from './pages/DealView/DealView';
import Reports from './pages/Reports/Reports';
import { getHealth } from './services/api';

import './index.css';
import './App.css';

// ── Navigation ────────────────────────────────────────────────────────────────
function Nav() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [health, setHealth] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
    const interval = setInterval(() => {
      getHealth().then(setHealth).catch(() => setHealth(null));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="nav">
      <div className="nav__inner">
        <Link to="/" className="nav__logo">
          <span className="nav__logo-icon">🔍</span>
          <span className="nav__logo-text">AcquiSense</span>
          <span className="nav__logo-badge">AI</span>
        </Link>

        <nav className="nav__links">
          <NavLink to="/dashboard" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/new" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
            New Deal
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
            Reports
          </NavLink>
        </nav>

        <div className="nav__status">
          {health ? (
            <>
              <StatusDot ok={health.mongo === 'connected'} label="DB" />
              <StatusDot ok={health.python === 'ok'} label="AI" />
            </>
          ) : (
            <StatusDot ok={false} label="API" />
          )}
          <a href="http://localhost:3001" target="_blank" rel="noreferrer" className="nav__grafana">
            📊 Grafana
          </a>
        </div>
      </div>
    </header>
  );
}

function StatusDot({ ok, label }) {
  return (
    <div className="status-dot" title={`${label}: ${ok ? 'OK' : 'Down'}`}>
      <span className="status-dot__dot" style={{
        background: ok ? 'var(--color-p3)' : 'var(--color-p0)',
        boxShadow: `0 0 6px ${ok ? 'var(--color-p3)' : 'var(--color-p0)'}`,
      }} />
      <span className="status-dot__label">{label}</span>
    </div>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new" element={<NewDeal />} />
          <Route path="/deals/:id" element={<DealView />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ fontSize: 64 }}>404</div>
              <h2>Page not found</h2>
              <Link to="/" style={{ color: 'var(--color-accent)' }}>← Back to Home</Link>
            </div>
          } />
        </Routes>
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-bg-border)',
            fontSize: '14px',
          },
        }}
      />
    </BrowserRouter>
  );
}
