import React from 'react';
import { 
  Scale, 
  Landmark, 
  TrendingUp, 
  Cpu, 
  ShieldAlert, 
  Users, 
  Receipt, 
  Building2, 
  Leaf,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import './AgentGrid.css';

const DOMAINS = [
  { key: 'legal', label: 'Legal Liability', icon: Scale, color: 'var(--domain-legal, #38BDF8)' },
  { key: 'finance', label: 'Financial & EBITDA', icon: Landmark, color: 'var(--domain-finance, #10B981)' },
  { key: 'commercial', label: 'Commercial & Market', icon: TrendingUp, color: 'var(--domain-commercial, #6366F1)' },
  { key: 'tech', label: 'Tech & Architecture', icon: Cpu, color: 'var(--domain-tech, #818CF8)' },
  { key: 'cyber', label: 'Cyber & Zero-Day', icon: ShieldAlert, color: 'var(--domain-cyber, #F43F5E)' },
  { key: 'hr', label: 'Key Personnel & HR', icon: Users, color: 'var(--domain-hr, #EC4899)' },
  { key: 'tax', label: 'Tax & Transfer Pricing', icon: Receipt, color: 'var(--domain-tax, #F59E0B)' },
  { key: 'regulatory', label: 'Regulatory Compliance', icon: Building2, color: 'var(--domain-regulatory, #14B8A6)' },
  { key: 'esg', label: 'ESG & Environmental', icon: Leaf, color: 'var(--domain-esg, #84CC16)' },
];

export default function AgentGrid({ agentProgress = {} }) {
  return (
    <div className="agent-grid">
      {DOMAINS.map(({ key, label, icon: Icon, color }) => {
        const p = agentProgress[key] || {};
        const status = p.status || 'idle';
        const pct = p.pct || 0;
        const findings = p.findingsCount || 0;
        const isRunning = status === 'running';
        const isDone = status === 'done';
        const isFailed = status === 'failed';

        return (
          <div 
            key={key} 
            className={`agent-card glass-panel agent-card--${status}`}
            style={{ '--domain-accent': color }}
          >
            <div className="agent-card__header">
              <div 
                className="agent-card__icon-well"
                style={{ 
                  color,
                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                  borderColor: `color-mix(in srgb, ${color} 25%, transparent)`
                }}
              >
                <Icon size={20} />
              </div>

              <div className="agent-card__title-area">
                <div className="agent-card__label">{label}</div>
                <div className={`agent-card__status-pill agent-card__status-pill--${status}`}>
                  {isRunning && <Loader2 size={11} className="spin" />}
                  {isDone && <CheckCircle2 size={11} />}
                  {isFailed && <AlertCircle size={11} />}
                  <span>{status.toUpperCase()}</span>
                </div>
              </div>

              {isDone && findings > 0 && (
                <span className="agent-card__badge tabular-nums">
                  {findings} {findings === 1 ? 'Finding' : 'Findings'}
                </span>
              )}
            </div>

            {/* Specular Progress Track */}
            <div className="agent-card__bar-track">
              <div
                className={`agent-card__bar-fill ${isRunning ? 'agent-card__bar-fill--animated' : ''}`}
                style={{
                  width: `${isDone ? 100 : pct}%`,
                  background: isRunning
                    ? 'linear-gradient(90deg, var(--ai-primary), #818CF8)'
                    : isDone
                    ? 'var(--risk-p3)'
                    : isFailed
                    ? 'var(--risk-p0)'
                    : 'rgba(255, 255, 255, 0.05)',
                }}
              />
            </div>

            {/* Telemetry Footer */}
            <div className="agent-card__footer tabular-nums">
              {isRunning && (
                <span className="agent-card__pct">{Math.round(pct)}% Completed</span>
              )}
              {isDone && (
                <div className="agent-card__findings">
                  {findings === 0 ? (
                    <span className="agent-card__clean">Cryptographically Clean</span>
                  ) : (
                    <span className="agent-card__flagged">
                      <strong>{findings}</strong> flagged {findings === 1 ? 'vector' : 'vectors'}
                    </span>
                  )}
                </div>
              )}
              {status === 'idle' && (
                <span className="agent-card__idle-text">Agent in Standby</span>
              )}
            </div>

            {p.error && (
              <div className="agent-card__error" title={p.error}>
                <AlertCircle size={12} />
                <span>Error: {p.error.slice(0, 48)}…</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
