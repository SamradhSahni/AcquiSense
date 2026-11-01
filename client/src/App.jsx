import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { motion } from 'motion/react';
import { 
  ShieldCheck, 
  Activity, 
  Search, 
  Radar, 
  User, 
  LogOut, 
  LogIn, 
  UserPlus 
} from 'lucide-react';

import LandingPage from './pages/LandingPage/LandingPage';
import Dashboard from './pages/Dashboard/Dashboard';
import NewDeal from './pages/NewDeal/NewDeal';
import DealView from './pages/DealView/DealView';
import Reports from './pages/Reports/Reports';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import CommandPalette from './components/CommandPalette/CommandPalette';
import { getHealth } from './services/api';
import { getToken, removeToken, removeUser } from './services/auth';

import './index.css';
import './App.css';

// ── Global Cursor Spotlight Tracker ──────────────────────────────────────────
function useSpotlightTracker() {
  useEffect(() => {
    const handleMouseMove = (e) => {
      document.querySelectorAll('.glass-panel--interactive').forEach((card) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function Nav({ onOpenCommandPalette }) {
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
  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3200';

  const handleLogout = (e) => {
    e.preventDefault();
    removeToken();
    removeUser();
    window.location.href = '/';
  };

  return (
    <header className="nav">
      <div className="nav__inner">
        {/* Brand Mark */}
        <Link to="/" className="nav__logo">
          <div className="nav__logo-squircle">
            <ShieldCheck size={20} className="nav__logo-icon" />
          </div>
          <span className="nav__logo-text">AcquiSense</span>
          <span className="nav__logo-badge">FORENSIC AI</span>
        </Link>

        {/* Route Links */}
        {!isHome && !isLoginOrRegister && (
          <nav className="nav__links">
            {[
              { to: '/dashboard', label: 'Dashboard' },
              { to: '/new', label: 'New Deal' },
              { to: '/reports', label: 'Reports' },
            ].map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={`nav__link ${isActive ? 'nav__link--active' : ''}`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      className="nav__link-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="nav__link-text">{link.label}</span>
                </NavLink>
              );
            })}
          </nav>
        )}

        {/* Command Palette Trigger */}
        <button
          type="button"
          className="nav__command-trigger"
          onClick={onOpenCommandPalette}
          title="Open Command Palette (⌘K)"
        >
          <Search size={14} className="nav__command-icon" />
          <span className="nav__command-label">Search Deals &amp; Findings…</span>
          <span className="nav__command-kbd">⌘K</span>
        </button>

        {/* Telemetry Cluster */}
        <div className="nav__status">
          <div className="nav__telemetry-capsule">
            {health ? (
              <>
                <StatusDot ok={health.mongo === 'connected'} label="DB" />
                <StatusDot ok={health.python === 'ok'} label="AI" />
              </>
            ) : (
              <StatusDot ok={false} label="API" />
            )}
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noreferrer"
              className="nav__grafana"
              title="Grafana Telemetry & Observability"
            >
              <Activity size={13} />
              <span>Telemetry</span>
            </a>
          </div>
        </div>

        {/* Auth Actions */}
        {isAuthenticated && (
          <div className="nav__user">
            <span className="nav__user-avatar" title="Authenticated User">
              <User size={15} />
            </span>
            <Link to="/logout" onClick={handleLogout} className="nav__logout">
              <LogOut size={13} />
              <span>Logout</span>
            </Link>
          </div>
        )}

        {!isAuthenticated && !isLoginOrRegister && (
          <div className="nav__guest">
            <Link to="/login" className="nav__guest-btn nav__guest-btn--login">
              <LogIn size={14} />
              <span>Login</span>
            </Link>
            <Link to="/register" className="nav__guest-btn nav__guest-btn--register">
              <UserPlus size={14} />
              <span>Register</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function StatusDot({ ok, label }) {
  return (
    <div className="status-dot" title={`${label}: ${ok ? 'Operational' : 'Disconnected'}`}>
      <span
        className="status-dot__dot"
        style={{
          background: ok ? 'var(--risk-p3)' : 'var(--risk-p0)',
          boxShadow: `0 0 8px ${ok ? 'var(--risk-p3)' : 'var(--risk-p0)'}`,
        }}
      />
      <span className="status-dot__label">{label}</span>
    </div>
  );
}

// ── Private Route ─────────────────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const isAuthenticated = !!getToken();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// ── App Shell Root ────────────────────────────────────────────────────────────
export default function App() {
  const [cmdOpen, setCmdOpen] = useState(false);
  useSpotlightTracker();

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Nav onOpenCommandPalette={() => setCmdOpen(true)} />
      <CommandPalette open={cmdOpen} setOpen={setCmdOpen} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/new" element={<PrivateRoute><NewDeal /></PrivateRoute>} />
          <Route path="/deals/:id" element={<PrivateRoute><DealView /></PrivateRoute>} />
          <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
          <Route
            path="*"
            element={
              <div className="app-404-container">
                <div className="glass-panel app-404-card">
                  <div className="app-404-icon-well">
                    <Radar size={42} className="app-404-radar" />
                  </div>
                  <div className="app-404-code tabular-nums">404</div>
                  <h2 className="app-404-title">Signal Lost · Dossier Not Found</h2>
                  <p className="app-404-desc">
                    The requested due diligence resource does not exist or has been archived.
                  </p>
                  <Link to="/dashboard" className="btn btn-primary app-404-btn">
                    ← Return to Command Dashboard
                  </Link>
                </div>
              </div>
            }
          />
        </Routes>
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--glass-surface-heavy)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            backdropFilter: 'blur(20px)',
            fontSize: '14px',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-glass)',
          },
        }}
      />
    </BrowserRouter>
  );
}