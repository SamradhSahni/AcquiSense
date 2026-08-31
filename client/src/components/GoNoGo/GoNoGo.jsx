import React from 'react';
import './GoNoGo.css';

const CONFIG = {
  'GO':      { color: '#22c55e', glow: 'rgba(34,197,94,0.3)',    icon: '✓', label: 'GO',     sub: 'Proceed with acquisition' },
  'CAUTION': { color: '#eab308', glow: 'rgba(234,179,8,0.3)',    icon: '⚠', label: 'CAUTION', sub: 'Proceed with conditions' },
  'NO-GO':   { color: '#ef4444', glow: 'rgba(239,68,68,0.3)',    icon: '✕', label: 'NO-GO',  sub: 'Do not proceed' },
};

export default function GoNoGoVerdict({ verdict, executiveSummary, domainScores = {} }) {
  if (!verdict) return null;
  const cfg = CONFIG[verdict] || CONFIG['CAUTION'];

  const scorePairs = Object.entries(domainScores)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="gng-card" style={{ '--gng-color': cfg.color, '--gng-glow': cfg.glow }}>
      {/* Verdict badge */}
      <div className="gng-verdict">
        <div className="gng-verdict__circle">
          <span className="gng-verdict__icon">{cfg.icon}</span>
        </div>
        <div className="gng-verdict__text">
          <div className="gng-verdict__label">{cfg.label}</div>
          <div className="gng-verdict__sub">{cfg.sub}</div>
        </div>
      </div>

      {/* Executive summary */}
      {executiveSummary && (
        <div className="gng-summary">
          <div className="gng-summary__label">Executive Summary</div>
          <p className="gng-summary__text">{executiveSummary}</p>
        </div>
      )}

      {/* Domain risk scores */}
      {scorePairs.length > 0 && (
        <div className="gng-scores">
          <div className="gng-scores__label">Domain Risk Scores</div>
          {scorePairs.map(([domain, score]) => (
            <div key={domain} className="gng-score-row">
              <span className="gng-score-domain">{domain.charAt(0).toUpperCase() + domain.slice(1)}</span>
              <div className="gng-score-bar-track">
                <div
                  className="gng-score-bar-fill"
                  style={{
                    width: `${(score / 10) * 100}%`,
                    background: score >= 7 ? '#ef4444' : score >= 4 ? '#f97316' : score >= 2 ? '#eab308' : '#22c55e',
                  }}
                />
              </div>
              <span className="gng-score-val">{score.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
