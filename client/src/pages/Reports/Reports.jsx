import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReports } from '../../services/api';
import './Reports.css';

const GNG_CONFIG = {
  'GO': { color: 'var(--color-p3)', bg: 'var(--color-p3-muted)' },
  'CAUTION': { color: 'var(--color-p2)', bg: 'var(--color-p2-muted)' },
  'NO-GO': { color: 'var(--color-p0)', bg: 'var(--color-p0-muted)' },
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReports().then(setReports).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="reports">
      <div className="reports__header">
        <h1 className="reports__title">Report Library</h1>
        <p className="reports__sub">All completed due diligence analyses</p>
      </div>

      {loading ? (
        <div className="reports__loading"><div className="spinner" /></div>
      ) : reports.length === 0 ? (
        <div className="reports__empty">
          <div style={{ fontSize: 48 }}>📋</div>
          <h3>No reports yet</h3>
          <p>Complete a deal analysis to see reports here</p>
          <Link to="/new" style={{ textDecoration: 'none' }}>
            <button className="nd__btn nd__btn--primary">Start Analysis →</button>
          </Link>
        </div>
      ) : (
        <div className="reports__list">
          {reports.map((r) => {
            const gng = GNG_CONFIG[r.goNoGo];
            return (
              <div key={r._id} className="report-card">
                <div className="report-card__main">
                  <div className="report-card__name">
                    {typeof r.dealId === 'object' ? r.dealId?.name : 'Unnamed Deal'}
                  </div>
                  {r.dealId?.targetCompany && (
                    <div className="report-card__target">🏢 {r.dealId.targetCompany}</div>
                  )}
                  {r.executiveSummary && (
                    <p className="report-card__summary">{r.executiveSummary.slice(0, 160)}…</p>
                  )}
                  <div className="report-card__meta">
                    <span>{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {r.totalFindings != null && <span>{r.totalFindings} findings</span>}
                  </div>
                </div>
                <div className="report-card__right">
                  {gng && (
                    <div className="report-card__gng" style={{ color: gng.color, background: gng.bg }}>
                      {r.goNoGo}
                    </div>
                  )}
                  <div className="report-card__severity">
                    {Object.entries(r.severityDistribution || {}).map(([sev, count]) => count > 0 && (
                      <span key={sev} className={`badge badge-${sev.toLowerCase()}`}>{count} {sev}</span>
                    ))}
                  </div>
                  <Link to={`/deals/${r.dealId?._id || r.dealId}`} className="report-card__view">
                    View Report →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
