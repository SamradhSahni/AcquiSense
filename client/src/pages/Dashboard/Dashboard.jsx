import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeals } from '../../services/api';
import './Dashboard.css';

const STATUS_CONFIG = {
  draft: { color: 'var(--color-text-muted)', label: 'Draft', icon: '📝' },
  queued: { color: 'var(--color-accent)', label: 'Queued', icon: '⏳' },
  analyzing: { color: 'var(--color-accent)', label: 'Analyzing', icon: '🤖' },
  done: { color: 'var(--color-p3)', label: 'Complete', icon: '✅' },
  failed: { color: 'var(--color-p0)', label: 'Failed', icon: '❌' },
};

const GNG_CONFIG = {
  'GO': { color: 'var(--color-p3)', bg: 'var(--color-p3-muted)' },
  'CAUTION': { color: 'var(--color-p2)', bg: 'var(--color-p2-muted)' },
  'NO-GO': { color: 'var(--color-p0)', bg: 'var(--color-p0-muted)' },
};

function DealCard({ deal }) {
  const statusCfg = STATUS_CONFIG[deal.status] || STATUS_CONFIG.draft;
  const gng = deal.goNoGo ? GNG_CONFIG[deal.goNoGo] : null;

  return (
    <Link to={`/deals/${deal._id}`} className="deal-card">
      <div className="deal-card__header">
        <div>
          <div className="deal-card__name">{deal.name}</div>
          {deal.targetCompany && (
            <div className="deal-card__target">🏢 {deal.targetCompany}</div>
          )}
        </div>
        {gng && (
          <span
            className="deal-card__gng"
            style={{ color: gng.color, background: gng.bg }}
          >
            {deal.goNoGo}
          </span>
        )}
      </div>

      <div className="deal-card__meta">
        <span className="deal-card__status" style={{ color: statusCfg.color }}>
          {statusCfg.icon} {statusCfg.label}
        </span>
        {deal.totalFindings > 0 && (
          <span className="deal-card__findings">{deal.totalFindings} findings</span>
        )}
        {deal.files?.length > 0 && (
          <span className="deal-card__files">📄 {deal.files.length} file{deal.files.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Risk score bar */}
      {deal.overallRiskScore > 0 && (
        <div className="deal-card__risk">
          <div className="deal-card__risk-label">Risk Score</div>
          <div className="deal-card__risk-bar">
            <div
              className="deal-card__risk-fill"
              style={{
                width: `${(deal.overallRiskScore / 10) * 100}%`,
                background: deal.overallRiskScore >= 7 ? 'var(--color-p0)' :
                            deal.overallRiskScore >= 4 ? 'var(--color-p1)' : 'var(--color-p3)',
              }}
            />
          </div>
          <span className="deal-card__risk-val">{deal.overallRiskScore.toFixed(1)}</span>
        </div>
      )}

      <div className="deal-card__date">
        {new Date(deal.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getDeals().then(setDeals).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? deals : deals.filter((d) => d.status === filter);

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Deal Dashboard</h1>
          <p className="dashboard__sub">{deals.length} deal{deals.length !== 1 ? 's' : ''} in your pipeline</p>
        </div>
        <Link to="/new" className="dashboard__new-btn">
          + New Deal
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="dashboard__filters">
        {['all', 'analyzing', 'done', 'draft', 'failed'].map((f) => (
          <button
            key={f}
            className={`dashboard__filter-tab ${filter === f ? 'dashboard__filter-tab--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="dashboard__filter-count">
              {f === 'all' ? deals.length : deals.filter((d) => d.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="dashboard__loading">
          <div className="spinner" />
          <p>Loading deals…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dashboard__empty">
          <div className="dashboard__empty-icon">🔍</div>
          <h3>No deals yet</h3>
          <p>Start your first due diligence analysis</p>
          <Link to="/new" className="lp-btn lp-btn--primary" style={{ textDecoration: 'none' }}>
            New Deal →
          </Link>
        </div>
      ) : (
        <div className="dashboard__grid">
          {filtered.map((deal) => <DealCard key={deal._id} deal={deal} />)}
        </div>
      )}
    </div>
  );
}
