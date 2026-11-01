import React, { useState, useEffect, useCallback } from 'react';
import { 
  Zap, 
  RefreshCw, 
  Circle, 
  User, 
  Wrench, 
  CheckCircle2, 
  CheckCheck, 
  Bot, 
  Edit3, 
  XCircle, 
  Pin, 
  AlertTriangle,
  X,
  Plus,
  ShieldCheck
} from 'lucide-react';
import './RiskActionCenter.css';
import { getUser } from '../../services/auth';
import {
  getDealFindings,
  getDealFindingsSummary,
  syncJobFindings,
  actionFinding,
  reviewFinding
} from '../../services/api';

const SEV_COLORS = {
  P0: 'var(--risk-p0, #F43F5E)',
  P1: 'var(--risk-p1, #F97316)',
  P2: 'var(--risk-p2, #F59E0B)',
  P3: 'var(--risk-p3, #10B981)',
};

const DOMAIN_COLORS = {
  finance: 'var(--domain-finance, #10B981)',
  legal: 'var(--domain-legal, #38BDF8)',
  commercial: 'var(--domain-commercial, #6366F1)',
  tech: 'var(--domain-tech, #818CF8)',
  cyber: 'var(--domain-cyber, #F43F5E)',
  hr: 'var(--domain-hr, #EC4899)',
  tax: 'var(--domain-tax, #F59E0B)',
  regulatory: 'var(--domain-regulatory, #14B8A6)',
  esg: 'var(--domain-esg, #84CC16)',
};

const STATE_CONFIG = {
  open:        { label: 'Open',        color: 'var(--text-tertiary)', icon: Circle },
  assigned:    { label: 'Assigned',    color: 'var(--domain-commercial)', icon: User },
  remediating: { label: 'Remediating', color: 'var(--risk-p1)', icon: Wrench },
  verified:    { label: 'Verified',    color: 'var(--ai-primary)', icon: CheckCircle2 },
  closed:      { label: 'Closed',      color: 'var(--risk-p3)', icon: CheckCheck },
};

const REVIEW_CONFIG = {
  ai_generated: { label: 'AI Generated', color: 'var(--domain-commercial)', icon: Bot },
  confirmed:    { label: 'Confirmed',    color: 'var(--risk-p3)', icon: CheckCircle2 },
  modified:     { label: 'Modified',     color: 'var(--risk-p2)', icon: Edit3 },
  rejected:     { label: 'Rejected',     color: 'var(--risk-p0)', icon: XCircle },
};

// Helper to check if user has a specific permission from their groups
function hasPermission(user, permission) {
  if (!user) return false;
  // If user has no groups defined/empty (e.g. legacy login or single-tenant), default to allow
  if (!user.groups || !Array.isArray(user.groups) || user.groups.length === 0) return true;
  // If user belongs to admin group or has wildcard permission, allow
  const isAdmin = user.groups.some(g => 
    g.name === 'admin' || 
    (g.permissions && (g.permissions.includes('*') || g.permissions.includes('all')))
  );
  if (isAdmin) return true;

  return user.groups.some(group => {
    if (!group.permissions) return false;
    if (group.permissions.includes(permission)) return true;
    if (permission === 'job:sync' && (
      group.permissions.includes('job:create') || 
      group.permissions.includes('job:update') || 
      group.permissions.includes('finding:update') ||
      group.permissions.includes('finding:read')
    )) {
      return true;
    }
    return false;
  });
}

function WorkflowBadge({ state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.open;
  const Icon = cfg.icon;
  return (
    <span className="workflow-badge" style={{ borderColor: cfg.color, color: cfg.color }}>
      <Icon size={11} />
      <span>{cfg.label}</span>
    </span>
  );
}

function ReviewBadge({ status }) {
  const cfg = REVIEW_CONFIG[status] || REVIEW_CONFIG.ai_generated;
  const Icon = cfg.icon;
  return (
    <span className="review-badge" style={{ background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`, color: cfg.color, borderColor: `color-mix(in srgb, ${cfg.color} 30%, transparent)` }}>
      <Icon size={11} />
      <span>{cfg.label}</span>
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
    <div className="action-panel glass-panel">
      <div className="action-panel-header">
        <div className="action-panel-title-group">
          <span className="action-panel-sev tabular-nums" style={{ background: SEV_COLORS[finding.severity] }}>
            {finding.severity}
          </span>
          <strong className="action-panel-title">{finding.title}</strong>
        </div>
        <button className="action-panel-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="action-panel-meta">
        <span className="action-domain-badge" style={{ background: DOMAIN_COLORS[finding.domain] || 'var(--domain-commercial)' }}>
          {finding.domain}
        </span>
        <WorkflowBadge state={finding.workflowState} />
        <ReviewBadge status={finding.reviewStatus} />
      </div>

      {finding.description && <p className="action-panel-desc">{finding.description}</p>}

      {/* Action Buttons */}
      <div className="action-panel-actions">
        {['open','assigned'].includes(finding.workflowState) && hasPermission(user, 'finding:assign') && (
          <button className="rac-btn rac-btn--primary" onClick={() => setMode('assign')}>
            <User size={13} />
            <span>Assign</span>
          </button>
        )}
        {finding.workflowState === 'assigned' && hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--orange" onClick={() => { setNewState('remediating'); setMode('progress'); }}>
            <Wrench size={13} />
            <span>Mark Remediating</span>
          </button>
        )}
        {finding.workflowState === 'remediating' && hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--blue" onClick={() => { setNewState('verified'); setMode('progress'); }}>
            <CheckCircle2 size={13} />
            <span>Mark Verified</span>
          </button>
        )}
        {finding.workflowState !== 'closed' && hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--green" onClick={() => { setNewState('closed'); setMode('progress'); }}>
            <CheckCheck size={13} />
            <span>Close</span>
          </button>
        )}
        {hasPermission(user, 'finding:update') && (
          <button className="rac-btn rac-btn--ghost" onClick={() => setMode('condition')}>
            <Plus size={13} />
            <span>Condition</span>
          </button>
        )}
        {finding.reviewStatus === 'ai_generated' && hasPermission(user, 'finding:review') && (
          <>
            <button className="rac-btn rac-btn--confirm" onClick={() => setMode('confirm')}>
              <CheckCircle2 size={13} />
              <span>Confirm</span>
            </button>
            <button className="rac-btn rac-btn--modify" onClick={() => setMode('modify')}>
              <Edit3 size={13} />
              <span>Modify</span>
            </button>
            <button className="rac-btn rac-btn--reject" onClick={() => setMode('reject')}>
              <XCircle size={13} />
              <span>Reject</span>
            </button>
          </>
        )}
      </div>

      {/* Action Forms */}
      {mode === 'assign' && (
        <div className="action-form">
          <label>Assign to (email)</label>
          <input className="glass-input" value={assignTo} onChange={e => setAssignTo(e.target.value)} placeholder="analyst@firm.com" />
          <label>Due date (optional)</label>
          <input className="glass-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          <button className="rac-btn rac-btn--primary" onClick={submit} disabled={submitting || !assignTo}>
            {submitting ? 'Saving…' : 'Assign Finding'}
          </button>
        </div>
      )}

      {mode === 'condition' && (
        <div className="action-form">
          <label>Add condition / dependency</label>
          <input className="glass-input" value={condText} onChange={e => setCondText(e.target.value)} placeholder="e.g. Pending legal sign-off from GC" />
          <button className="rac-btn rac-btn--primary" onClick={submit} disabled={submitting || !condText}>
            {submitting ? 'Adding…' : 'Add Condition'}
          </button>
        </div>
      )}

      {mode === 'progress' && (
        <div className="action-form">
          <label>Notes (optional)</label>
          <textarea className="glass-input" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} placeholder="Add context…" />
          <button className="rac-btn rac-btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : `Confirm → ${STATE_CONFIG[newState]?.label}`}
          </button>
        </div>
      )}

      {(mode === 'confirm' || mode === 'reject') && (
        <div className="action-form">
          <label>Notes (optional)</label>
          <textarea className="glass-input" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2}
            placeholder={mode === 'reject' ? 'Reason for rejection…' : 'Add any notes…'} />
          <button
            className={`rac-btn ${mode === 'reject' ? 'rac-btn--reject' : 'rac-btn--confirm'}`}
            onClick={submit} disabled={submitting}
          >
            {submitting ? 'Saving…' : mode === 'confirm' ? 'Confirm Finding' : 'Reject Finding'}
          </button>
        </div>
      )}

      {mode === 'modify' && (
        <div className="action-form">
          <label>Title</label>
          <input className="glass-input" value={modTitle} onChange={e => setModTitle(e.target.value)} />
          <label>Description</label>
          <textarea className="glass-input" value={modDesc} onChange={e => setModDesc(e.target.value)} rows={3} />
          <label>Severity</label>
          <select className="glass-input" value={modSev} onChange={e => setModSev(e.target.value)}>
            {['P0','P1','P2','P3'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label>Notes</label>
          <textarea className="glass-input" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} placeholder="What did you change and why?" />
          <button className="rac-btn rac-btn--modify" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Modifications'}
          </button>
        </div>
      )}

      {/* Conditions */}
      {finding.conditions && finding.conditions.length > 0 && (
        <div className="conditions-list">
          <div className="conditions-title">Conditions</div>
          {finding.conditions.map(c => (
            <div key={c._id} className="condition-item">
              <div className="condition-text">
                <Pin size={12} className="condition-pin" />
                <span>{c.text}</span>
              </div>
              <span className="condition-meta tabular-nums">— {c.addedBy}</span>
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
  const user = getUser();

  const loadFindings = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (filters.domain !== 'all')        params.domain = filters.domain;
      if (filters.severity !== 'all')      params.severity = filters.severity;
      if (filters.workflowState !== 'all') params.workflowState = filters.workflowState;
      if (filters.reviewStatus !== 'all')  params.reviewStatus = filters.reviewStatus;

      const [fRes, sRes] = await Promise.all([
        getDealFindings(dealId, params),
        getDealFindingsSummary(dealId),
      ]);
      setFindings(fRes?.findings || []);
      setTotal(fRes?.total || 0);
      setSummary(sRes);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [dealId, filters.domain, filters.severity, filters.workflowState, filters.reviewStatus]);

  useEffect(() => { 
    loadFindings(); 
  }, [loadFindings]);

  const syncFindings = async () => {
    if (!jobId) {
      alert('No completed analysis job found for this deal to sync findings from.');
      return;
    }
    if (!hasPermission(user, 'job:sync')) {
      alert('You do not have permission to sync findings.');
      return;
    }
    setSyncing(true);
    try {
      const data = await syncJobFindings(jobId);
      await loadFindings();
      alert(`Findings synced successfully: ${data.message || 'Updated'}`);
    } catch (err) {
      alert(`Error: ${err?.response?.data?.error || err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAction = async (mode, findingId, payload) => {
    try {
      if (['confirm','reject','modify'].includes(mode)) {
        await reviewFinding(findingId, {
          reviewStatus: mode === 'modify' ? 'modified' : mode === 'confirm' ? 'confirmed' : 'rejected',
          by: user?.email || 'analyst',
          notes: payload.reviewNotes,
          ...(mode === 'modify' ? { title: payload.modTitle, description: payload.modDesc, severity: payload.modSev } : {}),
        });
      } else {
        await actionFinding(findingId, {
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
        });
      }
      await loadFindings();
      setSelected(null);
    } catch (err) {
      alert(`Error: ${err?.response?.data?.error || err.message}`);
    }
  };

  const domains = [...new Set(findings.map(f => f.domain))];
  const needsSync = !loading && findings.length === 0 && report;

  return (
    <div className="rac">
      {/* Header */}
      <div className="rac-header">
        <div className="rac-header-text">
          <div className="rac-header-pill">
            <ShieldCheck size={13} />
            <span>HUMAN-IN-THE-LOOP GOVERNANCE & REMEDIATION</span>
          </div>
          <h2 className="rac-title">Risk Action Center</h2>
          <p className="rac-subtitle">
            Assign accountability, track condition precedents, and calibrate AI findings prior to definitive IC report sign-off.
          </p>
        </div>
        <div className="rac-header-actions">
          {jobId && (
            <button className="rac-btn rac-btn--primary" onClick={syncFindings} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Syncing Findings…' : 'Sync Findings'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 6-Tile Workflow KPI Ribbon */}
      {summary && (
        <div className="rac-summary-grid">
          {Object.entries(STATE_CONFIG).map(([state, cfg]) => {
            const Icon = cfg.icon;
            const isSelected = filters.workflowState === state;

            return (
              <div 
                key={state} 
                className={`rac-summary-card glass-panel glass-panel--interactive ${isSelected ? 'rac-summary-card--selected' : ''}`} 
                onClick={() => setFilters(f => ({ ...f, workflowState: isSelected ? 'all' : state }))}
              >
                <div className="rac-summary-icon-row">
                  <Icon size={16} style={{ color: cfg.color }} />
                  <span className="rac-summary-label">{cfg.label}</span>
                </div>
                <div className="rac-summary-count tabular-nums" style={{ color: cfg.color }}>
                  {summary.workflow?.[state] || 0}
                </div>
              </div>
            );
          })}
          <div 
            className={`rac-summary-card rac-summary-card--review glass-panel glass-panel--interactive ${filters.reviewStatus === 'ai_generated' ? 'rac-summary-card--selected' : ''}`}
            onClick={() => setFilters(f => ({ ...f, reviewStatus: f.reviewStatus === 'ai_generated' ? 'all' : 'ai_generated' }))}
          >
            <div className="rac-summary-icon-row">
              <Bot size={16} style={{ color: 'var(--domain-commercial)' }} />
              <span className="rac-summary-label">Needs Review</span>
            </div>
            <div className="rac-summary-count tabular-nums" style={{ color: 'var(--domain-commercial)' }}>
              {summary.review?.ai_generated || 0}
            </div>
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="rac-filters glass-panel">
        <select className="glass-input rac-filter-select" value={filters.domain} onChange={e => setFilters(f => ({ ...f, domain: e.target.value }))}>
          <option value="all">All Domains</option>
          {domains.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
        </select>
        <select className="glass-input rac-filter-select" value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
          <option value="all">All Severities</option>
          {['P0','P1','P2','P3'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="glass-input rac-filter-select" value={filters.workflowState} onChange={e => setFilters(f => ({ ...f, workflowState: e.target.value }))}>
          <option value="all">All States</option>
          {Object.entries(STATE_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="glass-input rac-filter-select" value={filters.reviewStatus} onChange={e => setFilters(f => ({ ...f, reviewStatus: e.target.value }))}>
          <option value="all">All Review Statuses</option>
          {Object.entries(REVIEW_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="rac-count tabular-nums">{total} findings</span>
        {Object.values(filters).some(v => v !== 'all') && (
          <button className="rac-clear-btn" onClick={() => setFilters({ domain: 'all', severity: 'all', workflowState: 'all', reviewStatus: 'all' })}>
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="rac-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Empty sync state */}
      {needsSync && (
        <div className="rac-empty-state glass-panel">
          <div className="rac-empty-icon-well">
            <Zap size={32} />
          </div>
          <h3>Initialize Governance Queue</h3>
          <p>Import all AI-generated findings from the diligence audit to activate workflow tracking, condition enforcement, and human calibration.</p>
          <button className="rac-btn rac-btn--primary rac-empty-btn" onClick={syncFindings} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? 'spin' : ''} />
            <span>{syncing ? 'Importing Pipeline…' : 'Sync Findings Now'}</span>
          </button>
        </div>
      )}

      {loading && (
        <div className="rac-loading">
          <div className="rac-spinner" />
          <p>Syncing governance queue…</p>
        </div>
      )}

      {/* Two-column layout: findings list + action panel */}
      {!loading && findings.length > 0 && (
        <div className={`rac-layout ${selected ? 'rac-layout--split' : ''}`}>
          {/* Findings list */}
          <div className="rac-list">
            {findings.map(f => (
              <div
                key={f._id}
                className={`rac-finding-row glass-panel ${selected?._id === f._id ? 'rac-finding-row--active' : ''} ${f.reviewStatus === 'rejected' ? 'rac-finding-row--rejected' : ''}`}
                onClick={() => setSelected(selected?._id === f._id ? null : f)}
              >
                <div className="rac-finding-left">
                  <span className="rac-sev-badge tabular-nums" style={{ background: SEV_COLORS[f.severity] }}>
                    {f.severity}
                  </span>
                  <div className="rac-finding-info">
                    <div className="rac-finding-title">{f.title}</div>
                    <div className="rac-finding-meta">
                      <span className="rac-domain-tag" style={{ color: DOMAIN_COLORS[f.domain] || 'var(--domain-commercial)' }}>
                        {f.domain}
                      </span>
                      {f.assignedTo && (
                        <span className="rac-assignee">
                          <User size={11} />
                          <span>{f.assignedTo}</span>
                        </span>
                      )}
                      {f.conditions?.length > 0 && (
                        <span className="rac-conditions tabular-nums">
                          <Pin size={11} />
                          <span>{f.conditions.length} Conditions</span>
                        </span>
                      )}
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