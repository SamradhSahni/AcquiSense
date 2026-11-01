import React, { useState, useEffect } from 'react';
import { 
  MessageSquareQuote, 
  Compass, 
  Ear, 
  Link2, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  AlertTriangle, 
  Sparkles,
  HelpCircle,
  FileQuestion
} from 'lucide-react';
import './AnalystQuestions.css';
import { getAnalystQuestions } from '../../services/api';

const DOMAIN_COLORS = {
  finance:    'var(--domain-finance, #10B981)',
  legal:      'var(--domain-legal, #38BDF8)',
  commercial: 'var(--domain-commercial, #6366F1)',
  tech:       'var(--domain-tech, #818CF8)',
  cyber:      'var(--domain-cyber, #F43F5E)',
  hr:         'var(--domain-hr, #EC4899)',
  tax:        'var(--domain-tax, #F59E0B)',
  regulatory: 'var(--domain-regulatory, #14B8A6)',
  esg:        'var(--domain-esg, #84CC16)',
};

const SEVERITY_COLORS = { 
  P0: 'var(--risk-p0, #F43F5E)', 
  P1: 'var(--risk-p1, #F97316)', 
  P2: 'var(--risk-p2, #F59E0B)', 
  P3: 'var(--risk-p3, #10B981)' 
};

function QuestionCard({ question, index }) {
  const [expanded, setExpanded] = useState(false);
  const domainColor = DOMAIN_COLORS[question.domain] || 'var(--domain-commercial)';
  const sevColor = SEVERITY_COLORS[question.severity] || 'var(--risk-p2)';

  return (
    <div className={`question-card glass-panel glass-panel--interactive question-card--${(question.severity || 'p2').toLowerCase()}`}>
      <div className="question-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="question-header-meta">
          <span className="question-number tabular-nums">Q{String(index + 1).padStart(2, '0')}</span>
          <span className="question-severity-badge tabular-nums" style={{ background: sevColor }}>
            {question.severity}
          </span>
          <span 
            className="question-domain-badge" 
            style={{ 
              background: `color-mix(in srgb, ${domainColor} 15%, transparent)`,
              color: domainColor,
              borderColor: `color-mix(in srgb, ${domainColor} 30%, transparent)`
            }}
          >
            {question.domain}
          </span>
        </div>
        <p className="question-text">{question.question}</p>
        <div className="question-expand-wrapper">
          <button className="question-expand-btn" aria-label="Expand question">
            <span>{expanded ? 'Hide Rationale' : 'Expose Rationale'}</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="question-card-body">
          {question.rationale && (
            <div className="question-rationale glass-panel">
              <div className="detail-label">
                <Compass size={14} />
                <span>FORENSIC RATIONALE & LIABILITY EXPOSURE</span>
              </div>
              <p>{question.rationale}</p>
            </div>
          )}

          {question.what_to_look_for && (
            <div className="question-look-for glass-panel">
              <div className="detail-label detail-label--signal">
                <Ear size={14} />
                <span>TARGET SIGNAL / WHAT TO LISTEN FOR IN MANAGEMENT RESPONSE</span>
              </div>
              <p>{question.what_to_look_for}</p>
            </div>
          )}

          {question.linked_finding_ids && question.linked_finding_ids.length > 0 && (
            <div className="question-findings">
              <div className="detail-label">
                <Link2 size={13} />
                <span>GROUNDED EVIDENCE CITATIONS</span>
              </div>
              <div className="linked-ids">
                {question.linked_finding_ids.map(id => (
                  <code key={id} className="finding-id tabular-nums">
                    FINDING-{id.slice(0, 8).toUpperCase()}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalystQuestions({ jobId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeDomain, setActiveDomain] = useState('all');

  const fetchQuestions = async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const json = await getAnalystQuestions(jobId);
      setData(json);
      if (json.by_domain) {
        const firstDomain = Object.keys(json.by_domain)[0];
        if (firstDomain) setActiveDomain(firstDomain);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (jobId) fetchQuestions(); }, [jobId]);

  const domains = data?.by_domain ? Object.keys(data.by_domain) : [];
  const displayQuestions =
    activeDomain === 'all'
      ? data?.questions || []
      : data?.by_domain?.[activeDomain] || [];

  return (
    <div className="analyst-questions">
      {/* Header */}
      <div className="aq-header">
        <div className="aq-header-text">
          <div className="aq-header-pill">
            <MessageSquareQuote size={13} />
            <span>EXECUTIVE MANAGEMENT INTERROGATION ENGINE</span>
          </div>
          <h2 className="aq-title">Analyst Interview Questions</h2>
          <p className="aq-subtitle">
            Autonomous forensic interrogation guide synthesized from deal liabilities. Pinpoints what management may attempt to deflect and provides real-time signal detection.
          </p>
        </div>

        {data && (
          <div className="aq-stats">
            <div className="aq-stat glass-panel">
              <span className="aq-stat-value tabular-nums">{data.total}</span>
              <span className="aq-stat-label">Total Queries</span>
            </div>
            <div className="aq-stat glass-panel">
              <span className="aq-stat-value tabular-nums">{domains.length}</span>
              <span className="aq-stat-label">Active Domains</span>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="aq-loading glass-panel">
          <div className="aq-spinner-wrapper">
            <RefreshCw size={24} className="spin aq-spinner-icon" />
          </div>
          <p className="aq-loading-title">Synthesizing Management Interrogation Vectors…</p>
          <p className="aq-loading-sub">Distilling findings across 9 domains into forensic question matrices.</p>
        </div>
      )}

      {error && (
        <div className="aq-error">
          <div className="aq-error-left">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
          <button onClick={fetchQuestions} className="aq-retry-btn">
            <RefreshCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Domain Filter Pill Strip */}
          <div className="aq-domain-tabs">
            <button
              className={`aq-domain-tab glass-panel ${activeDomain === 'all' ? 'aq-domain-tab--active' : ''}`}
              onClick={() => setActiveDomain('all')}
            >
              <span>All Domains</span>
              <span className="aq-tab-count tabular-nums">{data.total}</span>
            </button>
            {domains.map(d => {
              const count = data.by_domain[d]?.length || 0;
              const isActive = activeDomain === d;
              const color = DOMAIN_COLORS[d] || 'var(--domain-commercial)';

              return (
                <button
                  key={d}
                  className={`aq-domain-tab glass-panel ${isActive ? 'aq-domain-tab--active' : ''}`}
                  onClick={() => setActiveDomain(d)}
                  style={isActive ? { borderColor: color, color } : {}}
                >
                  <span>{d.toUpperCase()}</span>
                  <span className="aq-tab-count tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Questions List */}
          <div className="aq-questions-list">
            {displayQuestions.length === 0 ? (
              <div className="aq-empty glass-panel">
                No targeted management questions generated for this domain cluster.
              </div>
            ) : (
              displayQuestions.map((q, i) => (
                <QuestionCard key={q.id || i} question={q} index={i} />
              ))
            )}
          </div>
        </>
      )}

      {!loading && !data && !error && (
        <div className="aq-empty-state glass-panel">
          <div className="aq-empty-icon-well">
            <FileQuestion size={36} />
          </div>
          <h3>Generate Interrogation Matrix</h3>
          <p>Deploy AI to cross-reference identified deal liabilities with management interview techniques and signal detection rubrics.</p>
          <button className="aq-generate-btn" onClick={fetchQuestions}>
            <Sparkles size={16} />
            <span>Generate Interview Matrix</span>
          </button>
        </div>
      )}
    </div>
  );
}
