import React, { useState, useRef, useEffect } from 'react';
import './CopilotPanel.css';

const SUGGESTED_QUERIES = [
  'Why is this deal considered high risk?',
  'Show me all P0 and P1 findings.',
  'Which findings could affect valuation?',
  'Are there legal risks connected to cybersecurity findings?',
  'What should I ask management in due diligence?',
  'Compare Finance and Commercial findings.',
  'Which findings have weak evidence?',
  'Which risks are dependent on each other?',
];

const SEVERITY_COLORS = {
  P0: '#ef4444',
  P1: '#f97316',
  P2: '#eab308',
  P3: '#22c55e',
};

const DOMAIN_COLORS = {
  finance:    '#6366f1',
  legal:      '#8b5cf6',
  commercial: '#06b6d4',
  tech:       '#3b82f6',
  cyber:      '#ef4444',
  hr:         '#ec4899',
  tax:        '#f59e0b',
  regulatory: '#14b8a6',
  esg:        '#22c55e',
};

function CitationCard({ citation, index }) {
  const [expanded, setExpanded] = useState(false);
  const domainColor = DOMAIN_COLORS[citation.domain] || '#6366f1';
  const sevColor = SEVERITY_COLORS[citation.severity] || '#eab308';

  return (
    <div className="citation-card" onClick={() => setExpanded(!expanded)}>
      <div className="citation-card-header">
        <span className="citation-ref">[{citation.ref_id}]</span>
        <span className="citation-severity-badge" style={{ background: sevColor }}>
          {citation.severity}
        </span>
        <span className="citation-domain-badge" style={{ background: domainColor }}>
          {citation.domain}
        </span>
        <span className="citation-title">{citation.title}</span>
        <span className="citation-expand-icon">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className="citation-card-body">
          {citation.file && (
            <div className="citation-source">
              📄 <span>{citation.file}</span>
              {citation.page > 0 && <span className="citation-page">p.{citation.page}</span>}
            </div>
          )}
          {citation.quote && (
            <blockquote className="citation-quote">
              "{citation.quote.slice(0, 250)}{citation.quote.length > 250 ? '…' : ''}"
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}

function Message({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-wrapper ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="message-avatar">
          <span>🤖</span>
        </div>
      )}
      <div className="message-content-wrapper">
        <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
          <p className="message-text">{message.content}</p>
          {message.confidence && (
            <div className={`confidence-badge confidence-${message.confidence}`}>
              {message.confidence === 'high' ? '✓' : message.confidence === 'medium' ? '~' : '?'} {message.confidence} confidence
            </div>
          )}
        </div>

        {/* Domain badges */}
        {message.domains_searched && message.domains_searched.length > 0 && (
          <div className="domains-searched">
            <span className="domains-label">Searched:</span>
            {message.domains_searched.map(d => (
              <span
                key={d}
                className="domain-badge"
                style={{ background: DOMAIN_COLORS[d] || '#6366f1' }}
              >
                {d}
              </span>
            ))}
          </div>
        )}

        {/* Citation cards */}
        {message.citations && message.citations.length > 0 && (
          <div className="citations-section">
            <div className="citations-header">
              📎 {message.citations.length} source{message.citations.length > 1 ? 's' : ''}
            </div>
            {message.citations.map((c, i) => (
              <CitationCard key={i} citation={c} index={i} />
            ))}
          </div>
        )}

        {/* Guardrail warnings */}
        {message.guardrail_warnings && message.guardrail_warnings.length > 0 && (
          <div className="guardrail-warning">
            ⚠️ {message.guardrail_warnings.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="message-wrapper assistant">
      <div className="message-avatar"><span>🤖</span></div>
      <div className="thinking-bubble">
        <div className="thinking-dots">
          <span></span><span></span><span></span>
        </div>
        <span className="thinking-label">AcquiSense Copilot is thinking…</span>
      </div>
    </div>
  );
}

export default function CopilotPanel({ dealId, jobId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const buildHistory = () =>
    messages.map(m => ({ role: m.role, content: m.content }));

  const sendMessage = async (queryText) => {
    const query = (queryText || input).trim();
    if (!query || loading) return;

    setInput('');
    setShowSuggestions(false);
    const userMsg = { role: 'user', content: query, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const response = await fetch(`/api/python/copilot/${dealId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          job_id: jobId,
          conversation_history: buildHistory(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const assistantMsg = {
        role: 'assistant',
        content: data.answer || 'I was unable to generate a response. Please try again.',
        citations: data.citations || [],
        domains_searched: data.domains_searched || [],
        confidence: data.confidence || 'medium',
        follow_up_suggestions: data.follow_up_suggestions || [],
        guardrail_warnings: data.guardrail_warnings || [],
        id: Date.now() + 1,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg = {
        role: 'assistant',
        content: `⚠️ Error: ${err.message}. Please ensure the analysis is complete and try again.`,
        citations: [],
        domains_searched: [],
        id: Date.now() + 1,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
  const followUps = lastAssistantMsg?.follow_up_suggestions || [];

  return (
    <div className="copilot-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="copilot-panel">

        {/* Header */}
        <div className="copilot-header">
          <div className="copilot-header-left">
            <div className="copilot-logo">
              <span className="copilot-logo-icon">⚡</span>
            </div>
            <div className="copilot-header-text">
              <h2 className="copilot-title">AcquiSense Copilot</h2>
              <p className="copilot-subtitle">Citation-grounded · 9 domain RAG · Guardrailed</p>
            </div>
          </div>
          <button className="copilot-close-btn" onClick={onClose} aria-label="Close Copilot">
            ✕
          </button>
        </div>

        {/* Messages area */}
        <div className="copilot-messages">
          {messages.length === 0 && showSuggestions && (
            <div className="copilot-welcome">
              <div className="welcome-icon">🔍</div>
              <h3>Ask anything about this deal</h3>
              <p>I'll search across all 9 domain findings and surface grounded, cited answers.</p>
              <div className="suggestion-chips-grid">
                {SUGGESTED_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    className="suggestion-chip"
                    onClick={() => sendMessage(q)}
                    disabled={loading}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}

          {loading && <ThinkingIndicator />}

          {/* Follow-up suggestions after last assistant message */}
          {!loading && followUps.length > 0 && (
            <div className="follow-up-section">
              <span className="follow-up-label">Follow-up:</span>
              <div className="follow-up-chips">
                {followUps.map((q, i) => (
                  <button
                    key={i}
                    className="follow-up-chip"
                    onClick={() => sendMessage(q)}
                    disabled={loading}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="copilot-input-area">
          <div className="copilot-input-wrapper">
            <textarea
              ref={inputRef}
              className="copilot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about findings, risks, documents, cross-references…"
              rows={2}
              disabled={loading}
              maxLength={600}
            />
            <button
              className="copilot-send-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              {loading ? (
                <span className="send-spinner"></span>
              ) : (
                <span>↑</span>
              )}
            </button>
          </div>
          <div className="copilot-input-footer">
            <span className="char-count">{input.length}/600</span>
            <span className="input-hint">⏎ Send · Shift+⏎ New line · Guardrailed by AcquiSense</span>
          </div>
        </div>

      </div>
    </div>
  );
}
