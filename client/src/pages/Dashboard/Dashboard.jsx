import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Building2, 
  FileText, 
  AlertTriangle, 
  Plus, 
  FolderSearch, 
  TrendingUp, 
  CheckCircle2, 
  Loader2, 
  Clock, 
  XCircle,
  FileSearch,
  ArrowUpRight
} from 'lucide-react';
import { getDeals } from '../../services/api';
import './Dashboard.css';

const STATUS_CONFIG = {
  draft: { color: 'var(--text-muted)', label: 'Draft', icon: Clock },
  queued: { color: 'var(--risk-p2)', label: 'Queued', icon: Clock },
  analyzing: { color: 'var(--ai-primary)', label: 'Analyzing', icon: Loader2, pulse: true },
  done: { color: 'var(--risk-p3)', label: 'Complete', icon: CheckCircle2 },
  failed: { color: 'var(--risk-p0)', label: 'Failed', icon: XCircle },
};

const GNG_CONFIG = {
  'GO': { color: 'var(--risk-p3)', bg: 'var(--risk-p3-bg)', border: 'var(--risk-p3-border)' },
  'CAUTION': { color: 'var(--risk-p2)', bg: 'var(--risk-p2-bg)', border: 'var(--risk-p2-border)' },
  'NO-GO': { color: 'var(--risk-p0)', bg: 'var(--risk-p0-bg)', border: 'var(--risk-p0-border)' },
};

function DealCard({ deal }) {
  const statusCfg = STATUS_CONFIG[deal.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;
  const gng = deal.goNoGo ? GNG_CONFIG[deal.goNoGo] : null;

  const riskScore = deal.overallRiskScore != null ? Number(deal.overallRiskScore) : 0;
  const riskPercent = Math.min(100, Math.max(0, (riskScore / 10) * 100));

  const getRiskColor = (score) => {
    if (score >= 7) return 'var(--risk-p0)';
    if (score >= 4) return 'var(--risk-p1)';
    if (score >= 2) return 'var(--risk-p2)';
    return 'var(--risk-p3)';
  };

  return (
    <Link to={`/deals/${deal._id}`} className="deal-card glass-panel glass-panel--interactive">
      <div className="deal-card__top">
        <div className="deal-card__status-capsule" style={{ color: statusCfg.color }}>
          <StatusIcon size={13} className={statusCfg.pulse ? 'spin' : ''} />
          <span>{statusCfg.label}</span>
        </div>

        {gng && (
          <span
            className="deal-card__gng-badge"
            style={{ color: gng.color, background: gng.bg, borderColor: gng.border }}
          >
            {deal.goNoGo}
          </span>
        )}
      </div>

      <div className="deal-card__body">
        <h3 className="deal-card__name">{deal.name}</h3>
        {deal.targetCompany && (
          <div className="deal-card__target">
            <Building2 size={13} className="deal-card__target-icon" />
            <span>{deal.targetCompany}</span>
            {deal.acquirer && <span className="deal-card__acquirer">→ {deal.acquirer}</span>}
          </div>
        )}
      </div>

      {/* Risk Telemetry Meter */}
      <div className="deal-card__risk">
        <div className="deal-card__risk-header">
          <span className="deal-card__risk-label">Forensic Risk Score</span>
          <span className="deal-card__risk-val tabular-nums" style={{ color: getRiskColor(riskScore) }}>
            {riskScore > 0 ? riskScore.toFixed(1) : '—'} <span className="deal-card__risk-max">/ 10</span>
          </span>
        </div>
        <div className="deal-card__risk-track">
          <div
            className="deal-card__risk-fill"
            style={{
              width: `${riskPercent}%`,
              background: getRiskColor(riskScore),
            }}
          />
        </div>
      </div>

      <div className="deal-card__footer">
        <div className="deal-card__metrics">
          {deal.totalFindings > 0 && (
            <span className="deal-card__metric" title="Total Identified Findings">
              <AlertTriangle size={12} />
              <span className="tabular-nums">{deal.totalFindings}</span>
            </span>
          )}
          {deal.files?.length > 0 && (
            <span className="deal-card__metric" title="Uploaded VDR Documents">
              <FileText size={12} />
              <span className="tabular-nums">{deal.files.length}</span>
            </span>
          )}
        </div>

        <div className="deal-card__date tabular-nums">
          {new Date(deal.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getDeals()
      .then((data) => setDeals(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? deals : deals.filter((d) => d.status === filter);

  // Compute 4 KPI values
  const totalDeals = deals.length;
  const completedAudits = deals.filter((d) => d.status === 'done').length;
  const activeInFlight = deals.filter((d) => ['analyzing', 'queued'].includes(d.status)).length;
  const scoredDeals = deals.filter((d) => (d.overallRiskScore || 0) > 0);
  const avgRiskScore =
    scoredDeals.length > 0
      ? (scoredDeals.reduce((acc, d) => acc + d.overallRiskScore, 0) / scoredDeals.length).toFixed(1)
      : '0.0';

  return (
    <div className="dashboard">
      {/* ── Executive Header ─────────────────────────────────────────────────── */}
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">M&amp;A Deal Command Pipeline</h1>
          <p className="dashboard__subtitle">
            Autonomous forensic diligence fleet telemetry across active acquisition targets.
          </p>
        </div>
        <Link to="/new" className="btn btn-primary dashboard__new-btn">
          <Plus size={16} />
          <span>Initialize Deal Room</span>
        </Link>
      </div>

      {/* ── Executive Portfolio Summary Ribbon ───────────────────────────────── */}
      <div className="dashboard__kpi-ribbon">
        <div className="glass-panel dashboard__kpi-tile">
          <div className="dashboard__kpi-icon-well" style={{ color: 'var(--ai-primary)' }}>
            <FolderSearch size={18} />
          </div>
          <div>
            <div className="dashboard__kpi-val tabular-nums">{totalDeals}</div>
            <div className="dashboard__kpi-label">Active Deal Vaults</div>
          </div>
        </div>

        <div className="glass-panel dashboard__kpi-tile">
          <div className="dashboard__kpi-icon-well" style={{ color: 'var(--risk-p3)' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="dashboard__kpi-val tabular-nums">{completedAudits}</div>
            <div className="dashboard__kpi-label">Completed IC Audits</div>
          </div>
        </div>

        <div className="glass-panel dashboard__kpi-tile">
          <div className="dashboard__kpi-icon-well" style={{ color: 'var(--risk-p1)' }}>
            <Loader2 size={18} className={activeInFlight > 0 ? 'spin' : ''} />
          </div>
          <div>
            <div className="dashboard__kpi-val tabular-nums">{activeInFlight}</div>
            <div className="dashboard__kpi-label">Analyses in Flight</div>
          </div>
        </div>

        <div className="glass-panel dashboard__kpi-tile">
          <div className="dashboard__kpi-icon-well" style={{ color: 'var(--brand-gold)' }}>
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="dashboard__kpi-val tabular-nums">{avgRiskScore}</div>
            <div className="dashboard__kpi-label">Portfolio Mean Risk</div>
          </div>
        </div>
      </div>

      {/* ── Segmented Glass Filter Dock ──────────────────────────────────────── */}
      <div className="dashboard__filter-dock">
        {['all', 'analyzing', 'done', 'queued', 'draft', 'failed'].map((f) => {
          const isActive = filter === f;
          const count = f === 'all' ? deals.length : deals.filter((d) => d.status === f).length;
          return (
            <button
              key={f}
              type="button"
              className={`dashboard__filter-tab ${isActive ? 'dashboard__filter-tab--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {isActive && (
                <motion.div
                  layoutId="dashboard-filter"
                  className="dashboard__filter-pill"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="dashboard__filter-label">
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </span>
              <span className="dashboard__filter-count tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Deal Grid / Empty / Shimmer States ────────────────────────────────── */}
      {loading ? (
        <div className="dashboard__grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-panel dashboard__skeleton-card">
              <div className="dashboard__skeleton-top shimmer" />
              <div className="dashboard__skeleton-title shimmer" />
              <div className="dashboard__skeleton-sub shimmer" />
              <div className="dashboard__skeleton-bar shimmer" />
              <div className="dashboard__skeleton-footer shimmer" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel dashboard__empty">
          <div className="dashboard__empty-icon-well">
            <FileSearch size={36} className="dashboard__empty-icon" />
          </div>
          <h3 className="dashboard__empty-title">No deals found</h3>
          <p className="dashboard__empty-desc">
            {filter === 'all'
              ? 'Initialize your first acquisition target and deploy the 13 forensic AI agents.'
              : `No acquisition deals currently in '${filter}' status.`}
          </p>
          <Link to="/new" className="btn btn-primary">
            <span>Initialize New Deal Room</span>
            <ArrowUpRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="dashboard__grid">
          {filtered.map((deal) => (
            <DealCard key={deal._id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
