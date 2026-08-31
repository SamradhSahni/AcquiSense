import React from 'react';
import './AgentGrid.css';

const DOMAINS = [
  { key: 'legal', label: 'Legal', icon: '⚖️' },
  { key: 'finance', label: 'Finance', icon: '💰' },
  { key: 'commercial', label: 'Commercial', icon: '📊' },
  { key: 'tech', label: 'Technology', icon: '💻' },
  { key: 'cyber', label: 'Cybersecurity', icon: '🔒' },
  { key: 'hr', label: 'Human Resources', icon: '👥' },
  { key: 'tax', label: 'Tax', icon: '📋' },
  { key: 'regulatory', label: 'Regulatory', icon: '🏛️' },
  { key: 'esg', label: 'ESG', icon: '🌱' },
];

const STATUS_COLORS = {
  idle: 'var(--color-text-muted)',
  running: 'var(--color-accent)',
  done: 'var(--color-p3)',
  failed: 'var(--color-p0)',
};

export default function AgentGrid({ agentProgress = {} }) {
  return (
    <div className="agent-grid">
      {DOMAINS.map(({ key, label, icon }) => {
        const p = agentProgress[key] || {};
        const status = p.status || 'idle';
        const pct = p.pct || 0;
        const findings = p.findingsCount || 0;
        const isRunning = status === 'running';
        const isDone = status === 'done';

        return (
          <div key={key} className={`agent-card agent-card--${status}`}>
            <div className="agent-card__header">
              <span className="agent-card__icon">{icon}</span>
              <div>
                <div className="agent-card__label">{label}</div>
                <div
                  className="agent-card__status"
                  style={{ color: STATUS_COLORS[status] || 'var(--color-text-muted)' }}
                >
                  {isRunning && <span className="pulse-dot" />}
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </div>
              </div>
              {isDone && findings > 0 && (
                <span className="agent-card__badge">{findings}</span>
              )}
            </div>

            {/* Progress bar */}
            <div className="agent-card__bar-track">
              <div
                className={`agent-card__bar-fill ${isRunning ? 'agent-card__bar-fill--animated' : ''}`}
                style={{
                  width: `${isDone ? 100 : pct}%`,
                  background: isRunning
                    ? 'linear-gradient(90deg, var(--color-accent), #60a5fa)'
                    : isDone
                    ? 'var(--color-p3)'
                    : status === 'failed'
                    ? 'var(--color-p0)'
                    : 'var(--color-bg-elevated)',
                }}
              />
            </div>

            {isDone && (
              <div className="agent-card__findings">
                {findings === 0 ? (
                  <span style={{ color: 'var(--color-p3)' }}>✓ No issues</span>
                ) : (
                  <span>
                    <strong style={{ color: 'var(--color-p1)' }}>{findings}</strong> finding{findings !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {p.error && (
              <div className="agent-card__error" title={p.error}>Error: {p.error.slice(0, 40)}…</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
