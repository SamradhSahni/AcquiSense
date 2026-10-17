import React, { useState, useEffect } from 'react';
import './DocumentComparator.css';

const CHANGE_TYPE_CONFIG = {
  changed: { label: 'Changed', color: '#f59e0b', icon: '↔' },
  new:     { label: 'New',     color: '#22c55e', icon: '＋' },
  removed: { label: 'Removed', color: '#ef4444', icon: '－' },
};
const SEV_CONFIG = {
  high:   { color: '#ef4444', label: 'High Impact' },
  medium: { color: '#f59e0b', label: 'Medium Impact' },
  low:    { color: '#22c55e', label: 'Low Impact' },
};
const RISK_DIR_CONFIG = {
  deteriorating: { color: '#ef4444', icon: '↗ Deteriorating' },
  improving:     { color: '#22c55e', icon: '↘ Improving' },
  stable:        { color: '#64748b', icon: '→ Stable' },
};

function ChangeCard({ change }) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = CHANGE_TYPE_CONFIG[change.type] || CHANGE_TYPE_CONFIG.changed;
  const sevCfg  = SEV_CONFIG[change.severity] || SEV_CONFIG.medium;

  return (
    <div className="change-card" data-type={change.type} onClick={() => setExpanded(!expanded)}>
      <div className="change-card-header">
        <span className="change-type-badge" style={{ background: `${typeCfg.color}22`, color: typeCfg.color, borderColor: `${typeCfg.color}44` }}>
          {typeCfg.icon} {typeCfg.label}
        </span>
        <span className="change-sev-dot" style={{ background: sevCfg.color }} title={sevCfg.label} />
        <span className="change-category">{change.category}</span>
        <p className="change-item">{change.item}</p>
        <span className="change-expand">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="change-card-body">
          {change.type !== 'new' && change.detail_a && (
            <div className="change-detail change-detail--a">
              <div className="detail-label">📄 Document A</div>
              <p>{change.detail_a}</p>
            </div>
          )}
          {change.type !== 'removed' && change.detail_b && (
            <div className="change-detail change-detail--b">
              <div className="detail-label">📄 Document B</div>
              <p>{change.detail_b}</p>
            </div>
          )}
          {change.business_impact && (
            <div className="change-impact">
              <div className="detail-label">💼 Business Impact</div>
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
      const res = await fetch(`/api/python/results/${jobId}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_a: fileA, file_b: fileB, name_a: nameA || fileA, name_b: nameB || fileB }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredChanges = result?.changes?.filter(c =>
    activeFilter === 'all' || c.type === activeFilter
  ) || [];

  const riskDirCfg = result ? RISK_DIR_CONFIG[result.risk_direction] || RISK_DIR_CONFIG.stable : null;

  return (
    <div className="doc-comparator">
      {/* Header */}
      <div className="dc-header">
        <h2 className="dc-title">📑 Document Comparator</h2>
        <p className="dc-subtitle">
          Select two documents from the deal data room and compare them semantically.
          Surfaces changed figures, new risks, removed clauses, and business impact.
        </p>
      </div>

      {/* File selector */}
      <div className="dc-selector">
        <div className="dc-selector-col">
          <label className="dc-label">📄 Document A (baseline)</label>
          {dealFiles.length > 0 ? (
            <select className="dc-select" value={fileA} onChange={e => setFileA(e.target.value)}>
              <option value="">Select document…</option>
              {dealFiles.map(f => <option key={f.savedName} value={f.savedName}>{f.originalName}</option>)}
            </select>
          ) : (
            <input className="dc-input" value={fileA} onChange={e => setFileA(e.target.value)} placeholder="Filename as stored in uploads…" />
          )}
          <input className="dc-input dc-input--label" value={nameA} onChange={e => setNameA(e.target.value)} placeholder="Label (e.g. Audited Accounts 2024)" />
        </div>

        <div className="dc-vs">↔</div>

        <div className="dc-selector-col">
          <label className="dc-label">📄 Document B (comparison)</label>
          {dealFiles.length > 0 ? (
            <select className="dc-select" value={fileB} onChange={e => setFileB(e.target.value)}>
              <option value="">Select document…</option>
              {dealFiles.map(f => <option key={f.savedName} value={f.savedName}>{f.originalName}</option>)}
            </select>
          ) : (
            <input className="dc-input" value={fileB} onChange={e => setFileB(e.target.value)} placeholder="Filename as stored in uploads…" />
          )}
          <input className="dc-input dc-input--label" value={nameB} onChange={e => setNameB(e.target.value)} placeholder="Label (e.g. Management Accounts 2025)" />
        </div>
      </div>

      <button className="dc-compare-btn" onClick={runComparison} disabled={!canCompare || loading}>
        {loading ? <><span className="dc-spinner" /> Comparing…</> : '⚡ Compare Documents'}
      </button>

      {error && <div className="dc-error">⚠️ {error}</div>}

      {/* Results */}
      {result && (
        <div className="dc-results">
          {/* Summary row */}
          <div className="dc-result-summary">
            <div className="dc-result-stat dc-result-stat--total">
              <span className="dc-stat-value">{result.total_changes}</span>
              <span className="dc-stat-label">Total Changes</span>
            </div>
            <div className="dc-result-stat">
              <span className="dc-stat-value" style={{ color: '#f59e0b' }}>{result.changed_count}</span>
              <span className="dc-stat-label">Changed</span>
            </div>
            <div className="dc-result-stat">
              <span className="dc-stat-value" style={{ color: '#22c55e' }}>{result.new_count}</span>
              <span className="dc-stat-label">New</span>
            </div>
            <div className="dc-result-stat">
              <span className="dc-stat-value" style={{ color: '#ef4444' }}>{result.removed_count}</span>
              <span className="dc-stat-label">Removed</span>
            </div>
            {riskDirCfg && (
              <div className="dc-risk-direction" style={{ color: riskDirCfg.color }}>
                {riskDirCfg.icon}
              </div>
            )}
          </div>

          {/* Document summaries */}
          <div className="dc-doc-summaries">
            <div className="dc-doc-summary dc-doc-summary--a">
              <div className="dc-doc-label">📄 {result.document_a}</div>
              <p>{result.document_a_summary}</p>
            </div>
            <div className="dc-doc-summary dc-doc-summary--b">
              <div className="dc-doc-label">📄 {result.document_b}</div>
              <p>{result.document_b_summary}</p>
            </div>
          </div>

          {/* Assessment */}
          {result.overall_assessment && (
            <div className="dc-assessment">
              <div className="dc-assessment-label">⚖️ Overall Assessment</div>
              <p>{result.overall_assessment}</p>
            </div>
          )}

          {/* Key questions */}
          {result.key_questions?.length > 0 && (
            <div className="dc-key-questions">
              <div className="dc-key-questions-label">❓ Key Questions for Management</div>
              <ul>
                {result.key_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}

          {/* Changes list with filter tabs */}
          <div className="dc-changes-section">
            <div className="dc-changes-header">
              <span className="dc-changes-title">Changes</span>
              <div className="dc-change-filters">
                {['all', 'changed', 'new', 'removed'].map(type => (
                  <button
                    key={type}
                    className={`dc-filter-btn ${activeFilter === type ? 'dc-filter-btn--active' : ''}`}
                    onClick={() => setActiveFilter(type)}
                    style={activeFilter === type && type !== 'all' ? { borderColor: CHANGE_TYPE_CONFIG[type]?.color, color: CHANGE_TYPE_CONFIG[type]?.color } : {}}
                  >
                    {type === 'all' ? 'All' : `${CHANGE_TYPE_CONFIG[type]?.icon} ${CHANGE_TYPE_CONFIG[type]?.label}`}
                    <span className="dc-filter-count">
                      {type === 'all' ? result.total_changes
                        : result.changes.filter(c => c.type === type).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="dc-changes-list">
              {filteredChanges.length === 0 ? (
                <div className="dc-empty">No {activeFilter !== 'all' ? activeFilter : ''} changes found.</div>
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
