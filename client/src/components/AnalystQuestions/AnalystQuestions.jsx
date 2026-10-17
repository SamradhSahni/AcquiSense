import React, { useState, useEffect } from 'react';
import './AnalystQuestions.css';

const DOMAIN_COLORS = {
  finance:    '#6366f1', legal:      '#8b5cf6',
  commercial: '#06b6d4', tech:       '#3b82f6',
  cyber:      '#ef4444', hr:         '#ec4899',
  tax:        '#f59e0b', regulatory: '#14b8a6', esg: '#22c55e',
};

const SEVERITY_COLORS = { P0: '#ef4444', P1: '#f97316', P2: '#eab308', P3: '#22c55e' };

function QuestionCard({ question, index }) {
  const [expanded, setExpanded] = useState(false);
  const domainColor = DOMAIN_COLORS[question.domain] || '#6366f1';
  const sevColor = SEVERITY_COLORS[question.severity] || '#eab308';

  return (
    <div className="question-card" data-severity={question.severity}>
      <div className="question-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="question-header-meta">
          <span className="question-number">Q{String(index + 1).padStart(2, '0')}</span>
          <span className="question-severity-badge" style={{ background: sevColor }}>
            {question.severity}
          </span>
          <span className="question-domain-badge" style={{ background: domainColor }}>
            {question.domain}
          </span>
        </div>
        <p className="question-text">{question.question}</p>
        <button className="question-expand-btn" aria-label="Expand question">
          {expanded ? '▲ Less' : '▼ More'}
        </button>
      </div>

      {expanded && (
        <div className="question-card-body">
          {question.rationale && (
            <div className="question-rationale">
              <span className="detail-label">📌 Rationale</span>
              <p>{question.rationale}</p>
            </div>
          )}
          {question.what_to_look_for && (
            <div className="question-look-for">
              <span className="detail-label">🔎 What to look for in the answer</span>
              <p>{question.what_to_look_for}</p>
            </div>
          )}
          {question.linked_finding_ids && question.linked_finding_ids.length > 0 && (
            <div className="question-findings">
              <span className="detail-label">🔗 Linked findings</span>
              <div className="linked-ids">
                {question.linked_finding_ids.map(id => (
                  <code key={id} className="finding-id">{id.slice(0, 8)}…</code>
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
      const res = await fetch(`/api/python/results/${jobId}/questions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      setData(json);
      if (json.by_domain) {
        const firstDomain = Object.keys(json.by_domain)[0];
        if (firstDomain) setActiveDomain(firstDomain);
      }
    } catch (err) {
      setError(err.message);
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
      <div className="aq-header">
        <div className="aq-header-text">
          <h2 className="aq-title">📋 Analyst Interview Questions</h2>
          <p className="aq-subtitle">
            AI-generated management interview questions based on deal findings.
            Each question is linked to specific evidence and includes guidance on what to look for.
          </p>
        </div>
        {data && (
          <div className="aq-stats">
            <div className="aq-stat">
              <span className="aq-stat-value">{data.total}</span>
              <span className="aq-stat-label">Questions</span>
            </div>
            <div className="aq-stat">
              <span className="aq-stat-value">{domains.length}</span>
              <span className="aq-stat-label">Domains</span>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="aq-loading">
          <div className="aq-spinner"></div>
          <p>Generating interview questions from deal findings…<br/>
            <small>This takes 20–30 seconds on first load.</small>
          </p>
        </div>
      )}

      {error && (
        <div className="aq-error">
          <span>⚠️ {error}</span>
          <button onClick={fetchQuestions} className="aq-retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Domain filter tabs */}
          <div className="aq-domain-tabs">
            <button
              className={`aq-domain-tab ${activeDomain === 'all' ? 'active' : ''}`}
              onClick={() => setActiveDomain('all')}
            >
              All ({data.total})
            </button>
            {domains.map(d => (
              <button
                key={d}
                className={`aq-domain-tab ${activeDomain === d ? 'active' : ''}`}
                onClick={() => setActiveDomain(d)}
                style={activeDomain === d ? { borderColor: DOMAIN_COLORS[d], color: DOMAIN_COLORS[d] } : {}}
              >
                {d} ({data.by_domain[d]?.length || 0})
              </button>
            ))}
          </div>

          {/* Questions list */}
          <div className="aq-questions-list">
            {displayQuestions.length === 0 ? (
              <div className="aq-empty">No questions available for this domain.</div>
            ) : (
              displayQuestions.map((q, i) => (
                <QuestionCard key={q.id} question={q} index={i} />
              ))
            )}
          </div>
        </>
      )}

      {!loading && !data && !error && (
        <div className="aq-empty-state">
          <div className="aq-empty-icon">💬</div>
          <h3>Generate Interview Questions</h3>
          <p>AI will analyze all deal findings and create specific questions for management.</p>
          <button className="aq-generate-btn" onClick={fetchQuestions}>
            Generate Questions
          </button>
        </div>
      )}
    </div>
  );
}
