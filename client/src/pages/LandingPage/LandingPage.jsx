import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const DOMAINS = [
  { icon: '⚖️', name: 'Legal', desc: 'Contracts, IP, litigation' },
  { icon: '💰', name: 'Finance', desc: 'Revenue quality, liabilities' },
  { icon: '📊', name: 'Commercial', desc: 'Market, customers, GTM' },
  { icon: '💻', name: 'Technology', desc: 'Architecture, tech debt' },
  { icon: '🔒', name: 'Cybersecurity', desc: 'Breaches, GDPR, posture' },
  { icon: '👥', name: 'HR', desc: 'Key-person, culture, comp' },
  { icon: '📋', name: 'Tax', desc: 'Liabilities, international' },
  { icon: '🏛️', name: 'Regulatory', desc: 'Licenses, antitrust' },
  { icon: '🌱', name: 'ESG', desc: 'Environment, governance' },
];

const STATS = [
  { value: 13, label: 'AI Agents', suffix: '' },
  { value: 9, label: 'Domains', suffix: '' },
  { value: 100, label: 'Finding Types', suffix: '+' },
  { value: 5, label: 'Quality Gates', suffix: '' },
];

function useCounter(target, duration = 1500) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const steps = 40;
    const stepDuration = duration / steps;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setCount(Math.round((target * i) / steps));
      if (i >= steps) clearInterval(timer);
    }, stepDuration);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function StatCounter({ value, label, suffix }) {
  const count = useCounter(value);
  return (
    <div className="lp-stat">
      <div className="lp-stat__value">{count}{suffix}</div>
      <div className="lp-stat__label">{label}</div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero__grid-bg" />
        <div className="lp-hero__glow" />
        <div className="lp-hero__content">
          <div className="lp-hero__badge">🔍 Forensic M&amp;A Intelligence</div>
          <h1 className="lp-hero__headline">
            <span className="lp-hero__headline-line">13 AI Agents.</span>
            <span className="lp-hero__headline-line lp-hero__headline-line--accent">9 Domains.</span>
            <span className="lp-hero__headline-line">1 Verdict.</span>
          </h1>
          <p className="lp-hero__sub">
            Upload your data room. Our AI agents run parallel forensic due diligence across
            every domain — delivering a Go / No-Go decision backed by cited evidence in minutes.
          </p>
          <div className="lp-hero__cta">
            <Link to="/new" className="lp-btn lp-btn--primary">
              Start New Analysis →
            </Link>
            <Link to="/dashboard" className="lp-btn lp-btn--ghost">
              View Dashboard
            </Link>
          </div>
        </div>

        {/* Floating agent cards */}
        <div className="lp-hero__agents">
          {DOMAINS.slice(0, 5).map((d, i) => (
            <div key={d.name} className="lp-agent-card" style={{ animationDelay: `${i * 0.15}s` }}>
              <span className="lp-agent-card__icon">{d.icon}</span>
              <div>
                <div className="lp-agent-card__name">{d.name}</div>
                <div className="lp-agent-card__desc">{d.desc}</div>
              </div>
              <div className="lp-agent-card__status">
                <span className="lp-agent-card__dot" />
                Active
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="lp-stats">
        {STATS.map((s) => <StatCounter key={s.label} {...s} />)}
      </section>

      {/* Domains */}
      <section className="lp-domains">
        <h2 className="lp-section__title">Full-Spectrum Coverage</h2>
        <p className="lp-section__sub">Every specialist agent runs simultaneously — no bottlenecks.</p>
        <div className="lp-domains__grid">
          {DOMAINS.map((d, i) => (
            <div key={d.name} className="lp-domain-card" style={{ animationDelay: `${i * 0.07}s` }}>
              <div className="lp-domain-card__icon">{d.icon}</div>
              <div className="lp-domain-card__name">{d.name}</div>
              <div className="lp-domain-card__desc">{d.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="lp-how">
        <h2 className="lp-section__title">How It Works</h2>
        <div className="lp-steps">
          {[
            { n: '01', title: 'Upload Data Room', desc: 'Drag & drop PDFs, DOCX, spreadsheets from your VDR.' },
            { n: '02', title: 'Agents Run in Parallel', desc: '9 domain specialists analyze simultaneously using GPT-4o.' },
            { n: '03', title: 'Cross-Domain Synthesis', desc: 'GPT-4o connects compound risks across domains.' },
            { n: '04', title: 'Quality Gates', desc: '5 automated checks verify every finding has citations.' },
            { n: '05', title: 'Go / No-Go Verdict', desc: 'IC-ready report with executive summary and risk scores.' },
          ].map((step, i) => (
            <div key={step.n} className="lp-step">
              <div className="lp-step__connector" />
              <div className="lp-step__number">{step.n}</div>
              <div className="lp-step__content">
                <div className="lp-step__title">{step.title}</div>
                <div className="lp-step__desc">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section className="lp-cta">
        <div className="lp-cta__glow" />
        <h2 className="lp-cta__title">Ready to run your first deal?</h2>
        <Link to="/new" className="lp-btn lp-btn--primary lp-btn--lg">
          Launch Analysis →
        </Link>
      </section>
    </div>
  );
}
