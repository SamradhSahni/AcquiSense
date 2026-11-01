import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  OctagonAlert, 
  ShieldCheck, 
  FileText 
} from 'lucide-react';
import './GoNoGo.css';

const VERDICT_CONFIG = {
  'GO': {
    color: 'var(--risk-p3)',
    border: 'var(--risk-p3-border)',
    bg: 'var(--risk-p3-bg)',
    glow: 'rgba(16, 185, 129, 0.35)',
    icon: CheckCircle2,
    label: 'GO — ACQUISITION CLEARED',
    sub: 'Risk concentration below tolerance thresholds. Proceed with definitive transaction documents.',
  },
  'CAUTION': {
    color: 'var(--risk-p2)',
    border: 'var(--risk-p2-border)',
    bg: 'var(--risk-p2-bg)',
    glow: 'rgba(245, 158, 11, 0.35)',
    icon: AlertTriangle,
    label: 'CAUTION — CONDITIONAL APPROVAL',
    sub: 'Elevated liabilities detected. Structure specific indemnities, escrow holdbacks, or pre-closing remediations.',
  },
  'NO-GO': {
    color: 'var(--risk-p0)',
    border: 'var(--risk-p0-border)',
    bg: 'var(--risk-p0-bg)',
    glow: 'rgba(244, 63, 94, 0.35)',
    icon: OctagonAlert,
    label: 'NO-GO — TRANSACTION PROHIBITED',
    sub: 'Severe critical liabilities or zero-day vulnerabilities identified. Unacceptable downside exposure.',
  },
};

export default function GoNoGoVerdict({ verdict, executiveSummary, domainScores = {} }) {
  if (!verdict) return null;
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG['CAUTION'];
  const Icon = cfg.icon;

  const scorePairs = Object.entries(domainScores)
    .filter(([, v]) => typeof v === 'number' && v >= 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div 
      className="gng-card glass-panel" 
      style={{ 
        '--gng-color': cfg.color, 
        '--gng-glow': cfg.glow,
        '--gng-border': cfg.border,
        '--gng-bg': cfg.bg,
      }}
    >
      {/* Top Hero Verdict Seal & Header */}
      <div className="gng-hero">
        <div className="gng-seal-container">
          <div className="gng-seal-outer">
            <div className="gng-seal-inner">
              <Icon size={38} className="gng-seal-icon" />
            </div>
          </div>
        </div>

        <div className="gng-hero-text">
          <div className="gng-hero-overline">
            <ShieldCheck size={13} />
            <span>INVESTMENT COMMITTEE FORMAL RECOMMENDATION</span>
          </div>
          <h2 className="gng-hero-verdict">{cfg.label}</h2>
          <p className="gng-hero-sub">{cfg.sub}</p>
        </div>
      </div>

      <div className="gng-body-split">
        {/* Executive Summary Dossier */}
        <div className="gng-summary-pane">
          <div className="gng-pane-label">
            <FileText size={13} />
            <span>INSTITUTIONAL EXECUTIVE SYNTHESIS</span>
          </div>
          {executiveSummary ? (
            <div className="gng-summary-text">
              {executiveSummary}
            </div>
          ) : (
            <div className="gng-summary-placeholder">
              Comprehensive forensic dossier compiled and validated through 5 quality validation gates.
            </div>
          )}
        </div>

        {/* 9-Domain Risk Score Telemetry Bars */}
        {scorePairs.length > 0 && (
          <div className="gng-scores-pane">
            <div className="gng-pane-label">
              <span>DOMAIN RISK SCORE RANKING (0.0 — 10.0)</span>
            </div>

            <div className="gng-scores-list">
              {scorePairs.map(([domain, score]) => {
                const numScore = Number(score);
                const scoreColor =
                  numScore >= 7.0
                    ? 'var(--risk-p0)'
                    : numScore >= 4.0
                    ? 'var(--risk-p2)'
                    : 'var(--risk-p3)';

                return (
                  <div key={domain} className="gng-score-row">
                    <span className="gng-score-domain">
                      {domain.charAt(0).toUpperCase() + domain.slice(1)}
                    </span>

                    <div className="gng-score-track">
                      <div
                        className="gng-score-fill"
                        style={{
                          width: `${Math.min(100, (numScore / 10) * 100)}%`,
                          background: scoreColor,
                          boxShadow: `0 0 10px ${scoreColor}`,
                        }}
                      />
                    </div>

                    <span
                      className="gng-score-badge tabular-nums"
                      style={{ color: scoreColor, borderColor: `color-mix(in srgb, ${scoreColor} 30%, transparent)` }}
                    >
                      {numScore.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
