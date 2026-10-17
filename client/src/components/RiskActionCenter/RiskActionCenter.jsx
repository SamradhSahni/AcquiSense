import React, { useState, useEffect, useCallback } from 'react';
import './RiskActionCenter.css';
import { getUser } from '../../services/auth';

const SEV_COLORS  = { P0: '#ef4444', P1: '#f97316', P2: '#eab308', P3: '#22c55e' };
const DOMAIN_COLORS = {
  finance: '#6366f1', legal: '#8b5cf6', commercial: '#06b6d4',
  tech: '#3b82f6', cyber: '#ef4444', hr: '#ec4899',
  tax: '#f59e0b', regulatory: '#14b8a6', esg: '#22c55e',
};
const STATE_CONFIG = {
  open:        { label: 'Open',        color: '#64748b', icon: '◯' },
  assigned:    { label: 'Assigned',    color: '#6366f1', icon: '👤' },
  remediating: { label: 'Remediating', color: '#f97316', icon: '🔧' },
  verified:    { label: 'Verified',    color: '#3b82f6', icon: '✓' },
  closed:      { label: 'Closed',      color: '#22c55e', icon: '✔' },
};
const REVIEW_CONFIG = {
  ai_generated: { label: 'AI Generated', color: '#6366f1', icon: '🤖' },
  confirmed:    { label: 'Confirmed',    color: '#22c55e', icon: '✓' },
  modified:     { label: 'Modified',     color: '#f59e0b', icon: '✏️' },
  rejected:     { label: 'Rejected',     color: '#ef4444', icon: '✕' },
};

// Helper to check if user has a specific permission from their groups
function hasPermission(user, permission) {
  if (!user || !user.groups) return false;
  return user.groups.some(group =>
    group.permissions && group.permissions.includes(permission)
  );
}

function WorkflowBadge({ state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.open;
  return (
    <span className="workflow-badge" style={{ borderColor: cfg.color, color: cfg.color }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ReviewBadge({ status }) {
  const cfg = REVIEW_CONFIG[status] || REVIEW_CONFIG.ai_generated;
  return (
    <span className="review-badge" style={{ background: `${cfg.color}22`, color: cfg.color, borderColor: `${cfg.color}44` }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ActionPanel({ finding, onAction, onClose, user }) {
  const [mode, setMode] = useState(''); // 'assign'|'condition'|'progress'|'review'|'modify'
  const [assignTo, setAssignTo] = useState(finding.assignedTo || '');
  const [dueDate, setDueDate] = useState('');
  const [condText, setCondText] = useState('');
  const [newState, setNewState] = useState(finding.workflowState);
  const [reviewNotes, setReviewNotes] = useState('');
  const [modTitle, setModTitle] = useState(finding.title || '');
  const [modDesc, setModDesc] = useState(finding.description || '');
  const [modSev, setModSev] = useState(finding.severity || 'P2');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    await onAction(mode, finding._id, { assignTo, dueDate, condText, newState, reviewNotes, modTitle, modDesc, modSev });
    setSubmitting(false);
    setMode('');
  };

  return (
    <div className="action-panel">
      <div className="action-panel-header">
        <div>
          <span className="action-panel-sev" style={{ background: SEV_COLORS[finding.severity] }}>
            {finding.severity}
          </span>
          <strong className="action-panel-title">{finding.title}</strong>
        </div>
        <button className="action-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="action-panel-meta">
        <span className="action-domain-badge" style={{ background: DOMAIN_COLORS[finding.domain] || '#6366f1' }}>
          {finding.domain}
        </span>
        <WorkflowBadge state={finding.workflowState} />
        <ReviewBadge status={finding.reviewStatus} />
      </div>

      {finding.description && <p className="action-panel-desc">{finding.description}</p>}

      {/* Action Buttons */}
      <div className="action-panel-actions">
        {/* Assign button - only if user has permission */}
        {['open','assigned'].includes(finding.workflowState) && hasPermission(user, 'finding:assign') && (
          <button className="rac-btn rac-btn--primary" onClick={() => setMode('assign')}>👤 Assign</button>
        )}
        {/* Progress buttons - only if user has permission to update */}
        {finding.workflowState === 'assigned' && hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--orange" onClick={() => { setNewState('remediating'); setMode('progress'); }}>
            🔧 Mark Remediating
          </button>
        )}
        {finding.workflowState === 'remediating' && hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--blue" onClick={() => { setNewState('verified'); setMode('progress'); }}>
            ✓ Mark Verified
          </button>
        )}
        {/* Close button - only if user has permission to update */}
        {finding.workflowState !== 'closed' && hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--green" onClick={() => { setNewState('closed'); setMode('progress'); }}>
            ✔ Close
          </button>
        )}
        {/* Condition button - only if user has permission to update */}
        {hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--ghost" onClick={() => setMode('condition')}>＋ Condition</button>
        )}
        {/* Review buttons - only if user has permission to review */}
        {finding.reviewStatus === 'ai_generated' && hasPermission(user, 'finding:review') && (
          <>
            <button className="rac-btn rac-btn--confirm" onClick={() => setMode('confirm')}>✓ Confirm</button>
            <button className="rac-btn rac-btn--modify" onClick={() => setMode('modify')}>✏️ Modify</button>
            <button className="rac-btn rac-btn--reject" onClick={() => setMode('reject')}>✕ Reject</button>
          </>
        )}
      </div>

      {/* Action Forms */}
      {mode === 'assign' && (
        <div className="action-form">
          <label>Assign to (email)</label>
          <input value={assignTo} onChange={e => setAssignTo(e.target.value)} placeholder="analyst@firm.com" />
          <label>Due date (optional)</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          <button className="rac-btn rac-btn--primary" onClick={submit} disabled={submitting || !assignTo}>
            {submitting ? 'Saving…' : 'Assign'}
          </button>
        </div>
      )}

      {mode === 'condition' && (
        <div className="action-form">
          <label>Add condition / dependency</label>
          <input value={condText} onChange={e => setCondText(e.target.value)} placeholder="e.g. Pending legal sign-off from GC" />
          <button className="rac-btn rac-btn--primary" onClick={submit} disabled={submitting || !condText}>
            {submitting ? 'Adding…' : 'Add Condition'}
          </button>
        </div>
      )}

      {mode === 'progress' && (
        <div className="action-form">
          <label>Notes (optional)</label>
          <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} placeholder="Add context…" />
          <button className="rac-btn rac-btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : `Confirm → ${STATE_CONFIG[newState]?.label}`}
          </button>
        </div>
      )}

      {(mode === 'confirm' || mode === 'reject') && (
        <div className="action-form">
          <label>Notes (optional)</label>
          <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2}
            placeholder={mode === 'reject' ? 'Reason for rejection…' : 'Add any notes…'} />
          <button
            className={`rac-btn ${mode === 'reject' ? 'rac-btn--reject' : 'rac-btn--confirm'}`}
            onClick={submit} disabled={submitting}
          >
            {submitting ? 'Saving…' : mode === 'confirm' ? '✓ Confirm Finding' : '✕ Reject Finding'}
          </button>
        </div>
      )}

      {mode === 'modify' && (
        <div className="action-form">
          <label>Title</label>
          <input value={modTitle} onChange={e => setModTitle(e.target.value)} />
          <label>Description</label>
          <textarea value={modDesc} onChange={e => setModDesc(e.target.value)} rows={3} />
          <label>Severity</label>
          <select value={modSev} onChange={e => setModSev(e.target.value)}>
            {['P0','P1','P2','P3'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label>Notes</label>
          <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} placeholder="What did you change and why?" />
          <button className="rac-btn rac-btn--modify" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : '✏️ Save Modifications'}
          </button>
        </div>
      )}

      {/* Conditions */}
      {finding.conditions && finding.conditions.length > 0 && (
        <div className="conditions-list">
          <div className="conditions-title">Conditions</div>
          {finding.conditions.map(c => (
            <div key={c._id} className="condition-item">
              <span>📌 {c.text}</span>
              <span className="condition-meta">— {c.addedBy}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RiskActionCenter({ dealId, jobId, report }) {
  const [findings, setFindings]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [error, setError]           = useState(null);
  const [selected, setSelected]     = useState(null);
  const [filters, setFilters]       = useState({ domain: 'all', severity: 'all', workflowState: 'all', reviewStatus: 'all' });
  const [summary, setSummary]       = useState(null);
  const user = getUser(); // Get user from localStorage (set during login/register)

  const loadFindings = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (filters.domain !== 'all')        params.set('domain', filters.domain);
      if (filters.severity !== 'all')      params.set('severity', filters.severity);
      if (filters.workflowState !== 'all') params.set('workflowState', filters.workflowState);
      if (filters.reviewStatus !== 'all')  params.set('reviewStatus', filters.reviewStatus);

      const [fRes, sRes] = await Promise.all([
        fetch(`/api/findings/deal/${dealId}?${params}`).then(r => r.json()),
        fetch(`/api/findings/deal/${dealId}/summary`).then(r => r.json()),
      ]);
      setFindings(fRes.findings || []);
      setTotal(fRes.total || 0);
      setSummary(sRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dealId, filters, user]); // Re-fetch if user changes (permission changes)

  useEffect(() => { loadFindings(); }, [loadFindings]);

  const syncFindings = async () => {
    if (!jobId) return;
    // Check if user has permission to sync
    if (!hasPermission(user, 'job:sync')) {
      alert('You do not have permission to sync findings.');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`/api/findings/sync/${jobId}`, { method: 'POST' });
      const data = await res.json();
      await loadFindings();
      alert(`✓ ${data.message}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAction = async (mode, findingId, payload) => {
    try {
      let url, body;
      if (['confirm','reject','modify'].includes(mode)) {
        url = `/api/findings/${findingId}/review`;
        body = {
          reviewStatus: mode === 'modify' ? 'modified' : mode === 'confirm' ? 'confirmed' : 'rejected',
          by: user?.email || 'analyst',
          notes: payload.reviewNotes,
          ...(mode === 'modify' ? { title: payload.modTitle, description: payload.modDesc, severity: payload.modSev } : {}),
        };
      } else {
        url = `/api/findings/${findingId}/action`;
        body = {
          action: mode === 'assign' ? 'assign'
               : mode === 'condition' ? 'add_condition'
               : mode === 'progress' ? 'progress'
               : 'close',
          payload: {
            assignedTo: payload.assignTo,
            dueDate: payload.dueDate,
            text: payload.condText,
            workflowState: payload.newState,
          },
          by: user?.email || 'analyst',
          notes: payload.reviewNotes,
        };
      }
      await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await loadFindings();
      setSelected(null);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const domains = [...new Set(findings.map(f => f.domain))];
  const needsSync = !loading && findings.length === 0 && report;

  return (
    <div className="rac">
      {/* Header */}
      <div className="rac-header">
        <div className="rac-header-text">
          <h2 className="rac-title">⚡ Risk Action Center</h2>
          <p className="rac-subtitle">Manage, assign, and track remediation for every finding. Review and validate AI-generated findings before finalizing the report.</p>
        </div>
        <div className="rac-header-actions">
          {jobId && (
            <button className="rac-btn rac-btn--primary" onClick={syncFindings} disabled={syncing}>
              {syncing ? '⏳ Syncing…' : '⟳ Sync Findings'}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="rac-summary-grid">
          {Object.entries(STATE_CONFIG).map(([state, cfg]) => (
            <div key={state} className="rac-summary-card" onClick={() => setFilters(f => ({ ...f, workflowState: state }))}>
              <div className="rac-summary-icon">{cfg.icon}</div>
              <div className="rac-summary-count" style={{ color: cfg.color }}>{summary.workflow?.[state] || 0}</div>
              <div className="rac-summary-label">{cfg.label}</div>
            </div>
          ))}
          <div className="rac-summary-card rac-summary-card--review">
            <div className="rac-summary-icon">🤖</div>
            <div className="rac-summary-count" style={{ color: '#6366f1' }}>{summary.review?.ai_generated || 0}</div>
            <div className="rac-summary-label">Needs Review</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rac-filters">
        <select value={filters.domain} onChange={e => setFilters(f => ({ ...f, domain: e.target.value }))}>
          <option value="all">All Domains</option>
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
          <option value="all">All Severities</option>
          {['P0','P1','P2','P3'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.workflowState} onChange={e => setFilters(f => ({ ...f, workflowState: e.target.value }))}>
          <option value="all">All States</option>
          {Object.entries(STATE_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filters.reviewStatus} onChange={e => setFilters(f => ({ ...f, reviewStatus: e.target.value }))}>
          <option value="all">All Review Statuses</option>
          {Object.entries(REVIEW_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="rac-count">{total} findings</span>
        {Object.values(filters).some(v => v !== 'all') && (
          <button className="rac-clear-btn" onClick={() => setFilters({ domain: 'all', severity: 'all', workflowState: 'all', reviewStatus: 'all' })}>
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="rac-error">⚠️ {error}</div>}

      {/* Empty sync state */}
      {needsSync && (
        <div className="rac-empty-state">
          <div className="rac-empty-icon">⚡</div>
          <h3>Sync findings to get started</h3>
          <p>Click "Sync Findings" to import all AI-generated findings from the analysis into the Risk Action Center.</p>
          <button className="rac-btn rac-btn--primary rac-empty-btn" onClick={syncFindings} disabled={syncing}>
            {syncing ? '⏳ Syncing…' : '⟳ Sync Findings Now'}
          </button>
        </div>
      )}

      {loading && (
        <div className="rac-loading"><div className="rac-spinner" /><p>Loading findings…</p></div>
      )}

      {/* Two-column layout: findings list + action panel */}
      {!loading && findings.length > 0 && (
        <div className={`rac-layout ${selected ? 'rac-layout--split' : ''}`}>
          {/* Findings list */}
          <div className="rac-list">
            {findings.map(f => (
              <div
                key={f._id}
                className={`rac-finding-row ${selected?._id === f._id ? 'rac-finding-row--active' : ''} ${f.reviewStatus === 'rejected' ? 'rac-finding-row--rejected' : ''}`}
                onClick={() => setSelected(selected?._id === f._id ? null : f)}
              >
                <div className="rac-finding-left">
                  <span className="rac-sev-badge" style={{ background: SEV_COLORS[f.severity] }}>{f.severity}</span>
                  <div className="rac-finding-info">
                    <div className="rac-finding-title">{f.title}</div>
                    <div className="rac-finding-meta">
                      <span className="rac-domain-tag" style={{ color: DOMAIN_COLORS[f.domain] || '#6366f1' }}>{f.domain}</span>
                      {f.assignedTo && <span className="rac-assignee">👤 {f.assignedTo}</span>}
                      {f.conditions?.length > 0 && <span className="rac-conditions">📌 {f.conditions.length}</span>}
                    </div>
                  </div>
                </div>
                <div className="rac-finding-right">
                  <WorkflowBadge state={f.workflowState} />
                  <ReviewBadge status={f.reviewStatus} />
                </div>
              </div>
            ))}
          </div>

          {/* Action panel */}
          {selected && (
            <ActionPanel
              finding={selected}
              onAction={handleAction}
              onClose={() => setSelected(null)}
              user={user}
            />
          )}
        </div>
      )}
    </div>
  );
}