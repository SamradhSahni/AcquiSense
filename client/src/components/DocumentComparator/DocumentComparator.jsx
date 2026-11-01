import React, { useState } from 'react';
import { 
  ArrowLeftRight, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Briefcase, 
  Zap, 
  Scale, 
  HelpCircle, 
  AlertTriangle,
  Layers,
  ArrowRight
} from 'lucide-react';
import './DocumentComparator.css';
import { compareDocuments } from '../../services/api';

const CHANGE_TYPE_CONFIG = {
  changed: { label: 'Clause Modified', color: 'var(--risk-p2)', icon: ArrowLeftRight },
  new:     { label: 'New Risk Clause', color: 'var(--risk-p3)', icon: Plus },
  removed: { label: 'Removed Protection', color: 'var(--risk-p0)', icon: Minus },
};

const SEV_CONFIG = {
  high:   { color: 'var(--risk-p0)', label: 'High Liability' },
  medium: { color: 'var(--risk-p2)', label: 'Medium Variance' },
  low:    { color: 'var(--risk-p3)', label: 'Low Variance' },
};

const RISK_DIR_CONFIG = {
  deteriorating: { color: 'var(--risk-p0)', icon: TrendingUp, label: 'Deteriorating Risk Profile' },
  improving:     { color: 'var(--risk-p3)', icon: TrendingDown, label: 'Improving Risk Profile' },
  stable:        { color: 'var(--ai-primary)', icon: Minus, label: 'Neutral Risk Trajectory' },
};

function ChangeCard({ change }) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = CHANGE_TYPE_CONFIG[change.type] || CHANGE_TYPE_CONFIG.changed;
  const sevCfg  = SEV_CONFIG[change.severity] || SEV_CONFIG.medium;
  const TypeIcon = typeCfg.icon;

  return (
    <div className={`change-card glass-panel glass-panel--interactive change-card--${change.type}`} onClick={() => setExpanded(!expanded)}>
      <div className="change-card-header">
        <span className="change-type-badge" style={{ background: `color-mix(in srgb, ${typeCfg.color} 15%, transparent)`, color: typeCfg.color, borderColor: `color-mix(in srgb, ${typeCfg.color} 30%, transparent)` }}>
          <TypeIcon size={12} />
          <span>{typeCfg.label}</span>
        </span>
        <span className="change-sev-dot" style={{ background: sevCfg.color, boxShadow: `0 0 6px ${sevCfg.color}` }} title={sevCfg.label} />
        <span className="change-category tabular-nums">{change.category}</span>
        <p className="change-item">{change.item}</p>
        <span className="change-expand">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </div>

      {expanded && (
        <div className="change-card-body">
          <div className="change-diff-grid">
            {change.type !== 'new' && change.detail_a && (
              <div className="change-detail change-detail--a">
                <div className="detail-label">
                  <FileText size={12} />
                  <span>BASELINE (DOC A)</span>
                </div>
                <p>{change.detail_a}</p>
              </div>
            )}
            {change.type !== 'removed' && change.detail_b && (
              <div className="change-detail change-detail--b">
                <div className="detail-label">
                  <FileText size={12} />
                  <span>REVISED (DOC B)</span>
                </div>
                <p>{change.detail_b}</p>
              </div>
            )}
          </div>

          {change.business_impact && (
            <div className="change-impact">
              <div className="detail-label">
                <Briefcase size={12} />
                <span>QUANTIFIED BUSINESS & TRANSACTION IMPACT</span>
              </div>
              <p>{change.business_impact}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentComparator({ jobId, dealFiles = [] }) {
  const [fileA, setFileA] = useState('');
  const [fileB, setFileB] = useState('');
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const canCompare = fileA && fileB && fileA !== fileB;

  const runComparison = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await compareDocuments(jobId, {
        file_a: fileA,
        file_b: fileB,
        name_a: nameA || fileA,
        name_b: nameB || fileB,
      });
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredChanges = result?.changes?.filter(c =>
    activeFilter === 'all' || c.type === activeFilter
  ) || [];

  const riskDirCfg = result ? RISK_DIR_CONFIG[result.risk_direction] || RISK_DIR_CONFIG.stable : null;
  const DirIcon = riskDirCfg?.icon;

  return (
    <div className="doc-comparator">
      {/* Header */}
      <div className="dc-header">
        <div className="dc-header-pill">
          <Layers size={13} />
          <span>SEMANTIC CROSS-DOCUMENT RECONCILIATION</span>
        </div>
        <h2 className="dc-title">Document Comparator</h2>
        <p className="dc-subtitle">
          Execute multi-vector semantic comparison across Virtual Data Room versions to expose changed covenants, undisclosed liabilities, and risk velocity.
        </p>
      </div>

      {/* Dual VDR Selector Dock */}
      <div className="dc-selector glass-panel">
        <div className="dc-selector-col">
          <label className="dc-label">
            <FileText size={13} />
            <span>Document A (Baseline Reference)</span>
          </label>
          {dealFiles.length > 0 ? (
            <select className="glass-input dc-select" value={fileA} onChange={e => setFileA(e.target.value)}>
              <option value="">Select baseline document…</option>
              {dealFiles.map(f => <option key={f.savedName} value={f.savedName}>{f.originalName}</option>)}
            </select>
          ) : (
            <input className="glass-input dc-input" value={fileA} onChange={e => setFileA(e.target.value)} placeholder="Baseline filename stored in VDR…" />
          )}
          <input className="glass-input dc-input dc-input--label" value={nameA} onChange={e => setNameA(e.target.value)} placeholder="Custom Tag (e.g. Audited 2024 Final)" />
        </div>

        <div className="dc-vs-bridge">
          <div className="dc-vs-circle">
            <ArrowLeftRight size={18} />
          </div>
        </div>

        <div className="dc-selector-col">
          <label className="dc-label">
            <FileText size={13} />
            <span>Document B (Comparison Target)</span>
          </label>
          {dealFiles.length > 0 ? (
            <select className="glass-input dc-select" value={fileB} onChange={e => setFileB(e.target.value)}>
              <option value="">Select comparison document…</option>
              {dealFiles.map(f => <option key={f.savedName} value={f.savedName}>{f.originalName}</option>)}
            </select>
          ) : (
            <input className="glass-input dc-input" value={fileB} onChange={e => setFileB(e.target.value)} placeholder="Comparison filename in VDR…" />
          )}
          <input className="glass-input dc-input dc-input--label" value={nameB} onChange={e => setNameB(e.target.value)} placeholder="Custom Tag (e.g. Revised Management Accounts)" />
        </div>
      </div>

      <div className="dc-action-row">
        <button className="dc-compare-btn" onClick={runComparison} disabled={!canCompare || loading}>
          {loading ? (
            <>
              <div className="dc-spinner" />
              <span>Analyzing Semantic Variances…</span>
            </>
          ) : (
            <>
              <Zap size={16} />
              <span>Run Semantic Diff Engine</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="dc-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="dc-results">
          {/* Summary Metric Ribbon */}
          <div className="dc-result-summary glass-panel">
            <div className="dc-result-stat dc-result-stat--total">
              <span className="dc-stat-value tabular-nums">{result.total_changes}</span>
              <span className="dc-stat-label">Total Variances</span>
            </div>
            <div className="dc-result-stat">
              <span className="dc-stat-value tabular-nums" style={{ color: 'var(--risk-p2)' }}>{result.changed_count}</span>
              <span className="dc-stat-label">Modified Clauses</span>
            </div>
            <div className="dc-result-stat">
              <span className="dc-stat-value tabular-nums" style={{ color: 'var(--risk-p3)' }}>{result.new_count}</span>
              <span className="dc-stat-label">New Vectors</span>
            </div>
            <div className="dc-result-stat">
              <span className="dc-stat-value tabular-nums" style={{ color: 'var(--risk-p0)' }}>{result.removed_count}</span>
              <span className="dc-stat-label">Covenants Dropped</span>
            </div>

            {riskDirCfg && (
              <div className="dc-risk-direction" style={{ color: riskDirCfg.color, borderColor: `color-mix(in srgb, ${riskDirCfg.color} 30%, transparent)`, background: `color-mix(in srgb, ${riskDirCfg.color} 10%, transparent)` }}>
                <DirIcon size={16} />
                <span>{riskDirCfg.label}</span>
              </div>
            )}
          </div>

          {/* Document Summaries */}
          <div className="dc-doc-summaries">
            <div className="dc-doc-summary dc-doc-summary--a glass-panel">
              <div className="dc-doc-label">
                <FileText size={13} />
                <span>{result.document_a}</span>
              </div>
              <p>{result.document_a_summary}</p>
            </div>
            <div className="dc-doc-summary dc-doc-summary--b glass-panel">
              <div className="dc-doc-label">
                <FileText size={13} />
                <span>{result.document_b}</span>
              </div>
              <p>{result.document_b_summary}</p>
            </div>
          </div>

          {/* Assessment */}
          {result.overall_assessment && (
            <div className="dc-assessment glass-panel">
              <div className="dc-assessment-label">
                <Scale size={15} />
                <span>INVESTMENT COMMITTEE COMPARATIVE ASSESSMENT</span>
              </div>
              <p>{result.overall_assessment}</p>
            </div>
          )}

          {/* Key Questions */}
          {result.key_questions?.length > 0 && (
            <div className="dc-key-questions glass-panel">
              <div className="dc-key-questions-label">
                <HelpCircle size={15} />
                <span>CRITICAL RECONCILIATION QUESTIONS FOR TARGET MANAGEMENT</span>
              </div>
              <ul>
                {result.key_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Changes List with Filter Tabs */}
          <div className="dc-changes-section">
            <div className="dc-changes-header">
              <span className="dc-changes-title">Granular Clause Alterations</span>
              <div className="dc-change-filters">
                {['all', 'changed', 'new', 'removed'].map(type => (
                  <button
                    key={type}
                    className={`dc-filter-btn ${activeFilter === type ? 'dc-filter-btn--active' : ''}`}
                    onClick={() => setActiveFilter(type)}
                    style={activeFilter === type && type !== 'all' ? { borderColor: CHANGE_TYPE_CONFIG[type]?.color, color: CHANGE_TYPE_CONFIG[type]?.color } : {}}
                  >
                    {type === 'all' ? 'All Variances' : CHANGE_TYPE_CONFIG[type]?.label}
                    <span className="dc-filter-count tabular-nums">
                      {type === 'all' ? result.total_changes : result.changes.filter(c => c.type === type).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="dc-changes-list">
              {filteredChanges.length === 0 ? (
                <div className="dc-empty glass-panel">
                  No {activeFilter !== 'all' ? activeFilter : ''} variances detected across selected parameters.
                </div>
              ) : (
                filteredChanges.map((change, i) => <ChangeCard key={i} change={change} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
