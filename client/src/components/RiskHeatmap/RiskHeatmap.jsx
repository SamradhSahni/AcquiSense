import React, { useMemo } from 'react';
import './RiskHeatmap.css';

const DOMAINS = ['legal', 'finance', 'commercial', 'tech', 'cyber', 'hr', 'tax', 'regulatory', 'esg'];
const DOMAIN_LABELS = {
  legal: 'Legal', finance: 'Finance', commercial: 'Commercial', tech: 'Tech',
  cyber: 'Cyber', hr: 'HR', tax: 'Tax', regulatory: 'Regulatory', esg: 'ESG',
};
const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];
const SEV_COLORS = {
  P0: { base: '#ef4444', muted: 'rgba(239,68,68,0.15)' },
  P1: { base: '#f97316', muted: 'rgba(249,115,22,0.15)' },
  P2: { base: '#eab308', muted: 'rgba(234,179,8,0.15)' },
  P3: { base: '#22c55e', muted: 'rgba(34,197,94,0.15)' },
};

export default function RiskHeatmap({ domainFindings = {} }) {
  // Build matrix[domain][severity] = count
  const matrix = useMemo(() => {
    const m = {};
    DOMAINS.forEach((d) => {
      m[d] = { P0: 0, P1: 0, P2: 0, P3: 0 };
      const df = domainFindings[d];
      if (df?.findings) {
        df.findings.forEach((f) => {
          if (m[d][f.severity] !== undefined) m[d][f.severity]++;
        });
      }
    });
    return m;
  }, [domainFindings]);

  const maxCount = useMemo(() => {
    return Math.max(
      1,
      ...DOMAINS.flatMap((d) => SEVERITIES.map((s) => matrix[d][s]))
    );
  }, [matrix]);

  return (
    <div className="heatmap">
      <div className="heatmap__grid">
        {/* Header row */}
        <div className="heatmap__cell heatmap__cell--empty" />
        {SEVERITIES.map((sev) => (
          <div key={sev} className="heatmap__cell heatmap__cell--header">
            <span className="heatmap__sev-badge" style={{ background: SEV_COLORS[sev].muted, color: SEV_COLORS[sev].base }}>
              {sev}
            </span>
          </div>
        ))}

        {/* Data rows */}
        {DOMAINS.map((domain) => (
          <React.Fragment key={domain}>
            <div className="heatmap__cell heatmap__cell--domain">{DOMAIN_LABELS[domain]}</div>
            {SEVERITIES.map((sev) => {
              const count = matrix[domain][sev];
              const intensity = count / maxCount;
              const riskScore = domainFindings[domain]?.risk_score;
              return (
                <div
                  key={sev}
                  className="heatmap__cell heatmap__cell--data"
                  title={`${DOMAIN_LABELS[domain]} / ${sev}: ${count} finding${count !== 1 ? 's' : ''}`}
                  style={{
                    background: count > 0
                      ? `rgba(${hexToRgb(SEV_COLORS[sev].base)}, ${0.15 + intensity * 0.7})`
                      : 'var(--color-bg-elevated)',
                    color: count > 0 ? SEV_COLORS[sev].base : 'var(--color-text-muted)',
                    fontWeight: count > 0 ? 700 : 400,
                  }}
                >
                  {count > 0 ? count : '–'}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Risk score legend */}
      <div className="heatmap__legend">
        {SEVERITIES.map((sev) => (
          <div key={sev} className="heatmap__legend-item">
            <span className="heatmap__legend-dot" style={{ background: SEV_COLORS[sev].base }} />
            {sev}
          </div>
        ))}
      </div>
    </div>
  );
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
