/**
 * Due Diligence Agents — Root App (Phase 1 Skeleton)
 * Phase 4 adds full routing + pages. This proves the React container boots.
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Phase 4 will replace these inline stubs with real page components
const PlaceholderPage = ({ title, phase }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '16px',
    textAlign: 'center',
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      background: 'var(--color-accent-muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '28px',
    }}>🔍</div>
    <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{title}</h1>
    <p style={{ color: 'var(--color-text-secondary)', maxWidth: 400 }}>
      This page is implemented in <strong>Phase {phase}</strong>.
      The infrastructure skeleton is live — all containers are running.
    </p>
  </div>
);

// ── Minimal nav for Phase 1 ───────────────────────────────────────────────────
const Nav = () => (
  <header style={{
    height: 'var(--header-height)',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-bg-border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 var(--space-6)',
    gap: 'var(--space-8)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  }}>
    <Link to="/" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      color: 'var(--color-text-primary)', fontWeight: 700, fontSize: '16px',
    }}>
      <span style={{ fontSize: '20px' }}>🔍</span>
      <span>Due Diligence Agents</span>
    </Link>

    <nav style={{ display: 'flex', gap: 'var(--space-4)', marginLeft: 'auto' }}>
      {[
        { to: '/', label: 'Dashboard' },
        { to: '/new', label: 'New Deal' },
        { to: '/reports', label: 'Reports' },
      ].map(({ to, label }) => (
        <Link key={to} to={to} style={{
          color: 'var(--color-text-secondary)',
          fontSize: '14px', fontWeight: 500,
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          transition: 'all var(--transition-fast)',
        }}>{label}</Link>
      ))}
    </nav>

    {/* Status indicators */}
    <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'var(--space-4)' }}>
      <StatusDot label="API" href="http://localhost:4000/health" />
      <StatusDot label="Backend" href="http://localhost:8000/health" />
      <StatusDot label="Grafana" href="http://localhost:3001" />
    </div>
  </header>
);

const StatusDot = ({ label, href }) => (
  <a href={href} target="_blank" rel="noreferrer" style={{
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', color: 'var(--color-text-muted)',
  }}>
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      background: 'var(--color-go)',
      boxShadow: '0 0 6px var(--color-go)',
      display: 'inline-block',
    }} />
    {label}
  </a>
);

// ── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main style={{ padding: 'var(--space-8)' }}>
        <Routes>
          <Route path="/" element={<PlaceholderPage title="Deal Dashboard" phase={4} />} />
          <Route path="/new" element={<PlaceholderPage title="New Deal — Upload Data Room" phase={4} />} />
          <Route path="/deals/:id" element={<PlaceholderPage title="Live Analysis View" phase={4} />} />
          <Route path="/reports" element={<PlaceholderPage title="Report Library" phase={4} />} />
          <Route path="*" element={<PlaceholderPage title="404 — Page Not Found" phase="—" />} />
        </Routes>
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-bg-border)',
          },
        }}
      />
    </BrowserRouter>
  );
}
