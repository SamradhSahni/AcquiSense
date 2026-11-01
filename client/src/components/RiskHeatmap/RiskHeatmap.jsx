import React, { useMemo } from 'react';
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
  Info
} from 'lucide-react';
import './RiskHeatmap.css';

const DOMAIN_CONFIG = [
  { key: 'legal', label: 'Legal Liability', icon: Scale },
  { key: 'finance', label: 'Finance & EBITDA', icon: Landmark },
  { key: 'commercial', label: 'Commercial & Mkt', icon: TrendingUp },
  { key: 'tech', label: 'Technology Core', icon: Cpu },
  { key: 'cyber', label: 'Cyber Security', icon: ShieldAlert },
  { key: 'hr', label: 'Personnel & HR', icon: Users },
  { key: 'tax', label: 'Tax & Transfer', icon: Receipt },
  { key: 'regulatory', label: 'Regulatory', icon: Building2 },
  { key: 'esg', label: 'ESG & Env', icon: Leaf },
];

const SEVERITIES = [
  { key: 'P0', label: 'P0 Critical', color: 'var(--risk-p0)', border: 'var(--risk-p0-border)', bg: 'rgba(244, 63, 94, 0.18)', glow: 'rgba(244, 63, 94, 0.35)' },
  { key: 'P1', label: 'P1 High', color: 'var(--risk-p1)', border: 'var(--risk-p1-border)', bg: 'rgba(249, 115, 22, 0.18)', glow: 'rgba(249, 115, 22, 0.35)' },
  { key: 'P2', label: 'P2 Medium', color: 'var(--risk-p2)', border: 'var(--risk-p2-border)', bg: 'rgba(245, 158, 11, 0.18)', glow: 'rgba(245, 158, 11, 0.35)' },
  { key: 'P3', label: 'P3 Low', color: 'var(--risk-p3)', border: 'var(--risk-p3-border)', bg: 'rgba(16, 185, 129, 0.18)', glow: 'rgba(16, 185, 129, 0.35)' },
];

export default function RiskHeatmap({ domainFindings = {} }) {
  // Build matrix[domain][severity] = count
  const matrix = useMemo(() => {
    const m = {};
    DOMAIN_CONFIG.forEach(({ key }) => {
      m[key] = { P0: 0, P1: 0, P2: 0, P3: 0 };
      const df = domainFindings[key];
      if (df?.findings) {
        df.findings.forEach((f) => {
          if (m[key][f.severity] !== undefined) m[key][f.severity]++;
        });
      }
    });
    return m;
  }, [domainFindings]);

  const maxCount = useMemo(() => {
    return Math.max(
      1,
      ...DOMAIN_CONFIG.flatMap(({ key }) => SEVERITIES.map((s) => matrix[key][s.key]))
    );
  }, [matrix]);

  return (
    <div className="heatmap-container glass-panel">
      {/* Header Legend */}
      <div className="heatmap__legend-header">
        <div className="heatmap__title-group">
          <Info size={15} className="heatmap__info-icon" />
          <span className="heatmap__legend-title">9×4 FORENSIC CONCENTRATION MATRIX</span>
        </div>
        <div className="heatmap__legend-scales">
          {SEVERITIES.map((s) => (
            <div key={s.key} className="heatmap__legend-scale-item">
              <span className="heatmap__scale-dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
              <span className="heatmap__scale-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="heatmap__grid-wrapper">
        <div className="heatmap__grid">
          {/* Header row */}
          <div className="heatmap__col-header heatmap__col-header--domain">
            DOMAIN CLUSTER
          </div>
          {SEVERITIES.map((sev) => (
            <div key={sev.key} className="heatmap__col-header">
              <span className="heatmap__header-sev-pill" style={{ color: sev.color, borderColor: sev.border }}>
                {sev.key}
              </span>
            </div>
          ))}

          {/* Data rows */}
          {DOMAIN_CONFIG.map(({ key, label, icon: Icon }) => {
            const riskScore = domainFindings[key]?.risk_score;
            return (
              <React.Fragment key={key}>
                <div className="heatmap__cell-domain">
                  <div className="heatmap__domain-identity">
                    <Icon size={15} className="heatmap__domain-icon" />
                    <span className="heatmap__domain-name">{label}</span>
                  </div>
                  {riskScore !== undefined && (
                    <span className="heatmap__domain-score tabular-nums">
                      {Number(riskScore).toFixed(1)}
                    </span>
                  )}
                </div>

                {SEVERITIES.map((sev) => {
                  const count = matrix[key][sev.key];
                  const intensity = count > 0 ? 0.2 + (count / maxCount) * 0.8 : 0;

                  return (
                    <div
                      key={sev.key}
                      className={`heatmap__cell-data ${count > 0 ? 'heatmap__cell-data--active' : 'heatmap__cell-data--empty'}`}
                      title={`${label} • ${sev.label}: ${count} findings`}
                      style={
                        count > 0
                          ? {
                              background: sev.bg,
                              borderColor: sev.border,
                              color: sev.color,
                              boxShadow: `inset 0 0 16px ${sev.glow}`,
                              opacity: Math.max(0.65, intensity),
                            }
                          : undefined
                      }
                    >
                      <span className="tabular-nums">{count > 0 ? count : '—'}</span>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
