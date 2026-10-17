import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import LandingPage from './pages/LandingPage/LandingPage';
import Dashboard from './pages/Dashboard/Dashboard';
import NewDeal from './pages/NewDeal/NewDeal';
import DealView from './pages/DealView/DealView';
import Reports from './pages/Reports/Reports';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import { getHealth } from './services/api';
import { getToken } from './services/auth';

import './index.css';
import './App.css';

// ── Navigation ────────────────────────────────────────────────────────────────
function Nav() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isLoginOrRegister = location.pathname === '/login' || location.pathname === '/register';
  const [health, setHealth] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
    const interval = setInterval(() => {
      getHealth().then(setHealth).catch(() => setHealth(null));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const isAuthenticated = !!getToken();

  return (
    <header className="nav">
      <div className="nav__inner">
        <Link to="/" className="nav__logo">
          <span className="nav__logo-icon">🔍</span>
          <span className="nav__logo-text">AcquiSense</span>
          <span className="nav__logo-badge">AI</span>
        </Link>

        {!isHome && !isLoginOrRegister && (
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
        )}

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

        {/* Authenticated user actions */}
        {isAuthenticated && (
          <div className="nav__user">
            <span>👤</span>
            <Link to="/logout" onClick={handleLogout} className="nav__logout">
              Logout
            </Link>
          </div>
        )}

        {/* Guest actions */}
        {!isAuthenticated && !isLoginOrRegister && (
          <div className="nav__guest">
            <Link to="/login" className="nav__link">
              Login
            </Link>
            <Link to="/register" className="nav__link">
              Register
            </Link>
          </div>
        )}
      </div>
    </header>
  );

  function handleLogout(e) {
    e.preventDefault();
    // Remove token and user from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Redirect to home
    window.location.href = '/';
  }
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

// ── Private Route Component ───────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const isAuthenticated = !!getToken();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/new" element={<PrivateRoute><NewDeal /></PrivateRoute>} />
          <Route path="/deals/:id" element={<PrivateRoute><DealView /></PrivateRoute>} />
          <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
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