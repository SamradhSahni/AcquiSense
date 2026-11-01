import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Search, 
  ArrowUp, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Paperclip, 
  ChevronDown, 
  ChevronUp, 
  Bot,
  HelpCircle
} from 'lucide-react';
import './CopilotPanel.css';
import { askCopilot } from '../../services/api';

const SUGGESTED_QUERIES = [
  'Why is this deal classified under current risk posture?',
  'Synthesize all P0 and P1 liabilities across domains.',
  'Which forensic findings directly impact EBITDA / valuation?',
  'Are there regulatory exposure vectors linked to cyber findings?',
  'What key questions should the IC demand of management?',
  'Compare Finance and Commercial diligence findings.',
  'Which finding citations indicate missing contract clauses?',
  'What compound risks create cascade liability?',
];

const SEVERITY_COLORS = {
  P0: 'var(--risk-p0, #F43F5E)',
  P1: 'var(--risk-p1, #F97316)',
  P2: 'var(--risk-p2, #F59E0B)',
  P3: 'var(--risk-p3, #10B981)',
};

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

function CitationCard({ citation }) {
  const [expanded, setExpanded] = useState(false);
  const domainColor = DOMAIN_COLORS[citation.domain] || 'var(--domain-commercial)';
  const sevColor = SEVERITY_COLORS[citation.severity] || 'var(--risk-p2)';

  return (
    <div className="citation-card glass-panel" onClick={() => setExpanded(!expanded)}>
      <div className="citation-card-header">
        <span className="citation-ref tabular-nums">[{citation.ref_id}]</span>
        <span className="citation-severity-badge tabular-nums" style={{ background: sevColor }}>
          {citation.severity}
        </span>
        <span className="citation-domain-badge" style={{ color: domainColor, borderColor: `color-mix(in srgb, ${domainColor} 30%, transparent)` }}>
          {citation.domain}
        </span>
        <span className="citation-title">{citation.title}</span>
        <span className="citation-expand-icon">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </div>
      {expanded && (
        <div className="citation-card-body">
          {citation.file && (
            <div className="citation-source">
              <FileText size={12} className="citation-file-icon" />
              <span className="citation-file-name">{citation.file}</span>
              {citation.page > 0 && <span className="citation-page tabular-nums">Page {citation.page}</span>}
            </div>
          )}
          {citation.quote && (
            <blockquote className="citation-quote">
              "{citation.quote.slice(0, 280)}{citation.quote.length > 280 ? '…' : ''}"
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
          <Bot size={15} />
        </div>
      )}
      <div className="message-content-wrapper">
        <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble glass-panel'}`}>
          <p className="message-text">{message.content}</p>
          {message.confidence && (
            <div className={`confidence-badge confidence-${message.confidence}`}>
              {message.confidence === 'high' ? <CheckCircle2 size={11} /> : <HelpCircle size={11} />}
              <span>{message.confidence.toUpperCase()} CONFIDENCE</span>
            </div>
          )}
        </div>

        {/* Domain badges */}
        {message.domains_searched && message.domains_searched.length > 0 && (
          <div className="domains-searched">
            <span className="domains-label">SEARCHED:</span>
            {message.domains_searched.map(d => (
              <span
                key={d}
                className="domain-badge"
                style={{ 
                  color: DOMAIN_COLORS[d] || 'var(--domain-commercial)',
                  borderColor: `color-mix(in srgb, ${DOMAIN_COLORS[d] || '#6366F1'} 35%, transparent)`
                }}
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
              <Paperclip size={12} />
              <span>{message.citations.length} GROUNDED VDR CITATION{message.citations.length > 1 ? 'S' : ''}</span>
            </div>
            {message.citations.map((c, i) => (
              <CitationCard key={i} citation={c} />
            ))}
          </div>
        )}

        {/* Guardrail warnings */}
        {message.guardrail_warnings && message.guardrail_warnings.length > 0 && (
          <div className="guardrail-warning">
            <AlertTriangle size={13} />
            <span>{message.guardrail_warnings.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="message-wrapper assistant">
      <div className="message-avatar">
        <Bot size={15} />
      </div>
      <div className="thinking-bubble glass-panel">
        <div className="thinking-dots">
          <span></span><span></span><span></span>
        </div>
        <span className="thinking-label">AcquiSense RAG engine is reasoning across 9 domain knowledge graphs…</span>
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
      const data = await askCopilot(dealId, {
        query,
        job_id: jobId,
        conversation_history: buildHistory(),
      });

      const assistantMsg = {
        role: 'assistant',
        content: data.answer || 'I was unable to synthesize a response across current deal findings.',
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
        content: `Error: ${err?.response?.data?.detail || err?.response?.data?.error || err.message}. Please verify the analysis is complete and try again.`,
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
              <Sparkles size={18} className="copilot-logo-icon" />
            </div>
            <div className="copilot-header-text">
              <div className="copilot-title-row">
                <h2 className="copilot-title">AcquiSense Forensic Copilot</h2>
                <span className="copilot-pill">9-DOMAIN RAG</span>
              </div>
              <p className="copilot-subtitle">Citation-grounded · Cryptographically audited · Guardrailed</p>
            </div>
          </div>
          <button className="copilot-close-btn" onClick={onClose} aria-label="Close Copilot">
            <X size={16} />
          </button>
        </div>

        {/* Messages area */}
        <div className="copilot-messages">
          {messages.length === 0 && showSuggestions && (
            <div className="copilot-welcome">
              <div className="welcome-icon-well">
                <Search size={32} />
              </div>
              <h3>Interrogate Deal Data Room</h3>
              <p>Autonomous RAG intelligence connected to all 9 domain forensic vectors and evidence citations.</p>
              <div className="suggestion-chips-grid">
                {SUGGESTED_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    className="suggestion-chip glass-panel glass-panel--interactive"
                    onClick={() => sendMessage(q)}
                    disabled={loading}
                  >
                    <span>{q}</span>
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
              <span className="follow-up-label">SUGGESTED REASONING TRAJECTORIES:</span>
              <div className="follow-up-chips">
                {followUps.map((q, i) => (
                  <button
                    key={i}
                    className="follow-up-chip glass-panel glass-panel--interactive"
                    onClick={() => sendMessage(q)}
                    disabled={loading}
                  >
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Composer Bar */}
        <div className="copilot-input-area">
          <div className="copilot-input-wrapper glass-panel">
            <textarea
              ref={inputRef}
              className="copilot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about liabilities, EBITDA adjustments, zero-day CVEs, covenants…"
              rows={2}
              disabled={loading}
              maxLength={600}
            />
            <button
              className="copilot-send-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              aria-label="Send query"
            >
              {loading ? (
                <div className="send-spinner" />
              ) : (
                <ArrowUp size={18} />
              )}
            </button>
          </div>
          <div className="copilot-input-footer tabular-nums">
            <span className="char-count">{input.length}/600</span>
            <span className="input-hint">Enter to send · Shift+Enter for new line · Grounded by AcquiSense Guardrails</span>
          </div>
        </div>

      </div>
    </div>
  );
}
