import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Sparkles, 
  ArrowUpRight, 
  Scale, 
  Landmark, 
  TrendingUp, 
  Cpu, 
  ShieldAlert, 
  Users, 
  Receipt, 
  Building2, 
  Leaf, 
  ShieldCheck, 
  Zap, 
  FileSearch, 
  GitMerge, 
  CheckCircle2, 
  FileText 
} from 'lucide-react';
import './LandingPage.css';

const DOMAINS = [
  { icon: Scale, name: 'Legal', desc: 'Contracts, IP assignment, litigation exposure', colorVar: 'var(--domain-legal)' },
  { icon: Landmark, name: 'Finance', desc: 'Revenue quality, normalized EBITDA, debt liabilities', colorVar: 'var(--domain-finance)' },
  { icon: TrendingUp, name: 'Commercial', desc: 'Market position, customer concentration, GTM', colorVar: 'var(--domain-commercial)' },
  { icon: Cpu, name: 'Technology', desc: 'Architecture, technical debt, infrastructure scalability', colorVar: 'var(--domain-tech)' },
  { icon: ShieldAlert, name: 'Cybersecurity', desc: 'Historical breaches, GDPR exposure, SOC2 posture', colorVar: 'var(--domain-cyber)' },
  { icon: Users, name: 'Human Resources', desc: 'Key-person dependency, culture, compensation liabilities', colorVar: 'var(--domain-hr)' },
  { icon: Receipt, name: 'Tax', desc: 'Unrecorded liabilities, transfer pricing, nexus risks', colorVar: 'var(--domain-tax)' },
  { icon: Building2, name: 'Regulatory', desc: 'Operating licenses, antitrust scrutiny, export controls', colorVar: 'var(--domain-regulatory)' },
  { icon: Leaf, name: 'ESG', desc: 'Environmental liabilities, workplace safety, governance', colorVar: 'var(--domain-esg)' },
];

const STATS = [
  { value: 13, label: 'Autonomous Agents', suffix: '' },
  { value: 9, label: 'Forensic Domains', suffix: '' },
  { value: 5, label: 'Quality Verification Gates', suffix: '' },
  { value: 4, label: 'Minutes to IC Verdict', suffix: 'm', prefix: '< ' },
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

function StatCounter({ value, label, suffix, prefix }) {
  const count = useCounter(value);
  return (
    <div className="lp-stat-card glass-panel">
      <div className="lp-stat-card__value tabular-nums">
        {prefix}{count}{suffix}
      </div>
      <div className="lp-stat-card__label">{label}</div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      {/* ── Perspective Grid Hero ────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero__grid-mask" />
        <div className="lp-hero__ambient-glow" />

        <div className="lp-hero__content">
          <div className="lp-hero__badge">
            <Sparkles size={14} className="lp-hero__badge-icon" />
            <span>AUTONOMOUS 13-AGENT M&amp;A DILIGENCE ENGINE</span>
          </div>

          <h1 className="lp-hero__headline">
            Forensic Due Diligence in{' '}
            <span className="lp-hero__headline-gradient">Minutes, Not Months</span>.
          </h1>

          <p className="lp-hero__sub">
            Upload your confidential virtual data room. AcquiSense deploys 13 parallel forensic AI agents
            across 9 corporate domains — synthesizing compound liabilities and generating a verifiable,
            cited Investment Committee verdict before your competitors review document one.
          </p>

          <div className="lp-hero__cta">
            <Link to="/new" className="btn btn-primary lp-hero__btn-launch">
              <span>Launch Deal Room</span>
              <ArrowUpRight size={17} />
            </Link>
            <Link to="/dashboard" className="btn btn-outline lp-hero__btn-pipeline">
              <span>Explore Live Pipeline</span>
            </Link>
          </div>
        </div>

        {/* ── Right Column: 3D Floating Glass Agent Stack ──────────────────────── */}
        <div className="lp-hero__stack">
          {/* Card 1: Legal Agent */}
          <div className="glass-panel glass-panel--interactive lp-stack-card lp-stack-card--1">
            <div className="lp-stack-card__header">
              <div className="lp-stack-card__icon-well" style={{ color: 'var(--domain-legal)' }}>
                <Scale size={18} />
              </div>
              <div>
                <div className="lp-stack-card__title">Legal IP Assignment Audit</div>
                <div className="lp-stack-card__domain">Agent #01 · Legal Specialist</div>
              </div>
              <span className="badge badge-p0 lp-stack-card__badge">P0 Fatal</span>
            </div>
            <p className="lp-stack-card__desc">
              Unassigned founder IP patent claims discovered in Master Services Agreement Schedule B (p.42).
            </p>
            <div className="lp-stack-card__meter">
              <div className="lp-stack-card__meter-bar" style={{ width: '100%', background: 'var(--risk-p0)' }} />
            </div>
          </div>

          {/* Card 2: Finance Agent */}
          <div className="glass-panel glass-panel--interactive lp-stack-card lp-stack-card--2">
            <div className="lp-stack-card__header">
              <div className="lp-stack-card__icon-well" style={{ color: 'var(--domain-finance)' }}>
                <Landmark size={18} />
              </div>
              <div>
                <div className="lp-stack-card__title">EBITDA Bridge Normalization</div>
                <div className="lp-stack-card__domain">Agent #02 · Finance Specialist</div>
              </div>
              <span className="badge badge-p1 lp-stack-card__badge">P1 Material</span>
            </div>
            <p className="lp-stack-card__desc">
              $1.4M non-recurring capitalized R&amp;D costs improperly added back to adjusted EBITDA.
            </p>
            <div className="lp-stack-card__meter">
              <div className="lp-stack-card__meter-bar" style={{ width: '85%', background: 'var(--risk-p1)' }} />
            </div>
          </div>

          {/* Card 3: Cyber Agent */}
          <div className="glass-panel glass-panel--interactive lp-stack-card lp-stack-card--3">
            <div className="lp-stack-card__header">
              <div className="lp-stack-card__icon-well" style={{ color: 'var(--domain-cyber)' }}>
                <ShieldAlert size={18} />
              </div>
              <div>
                <div className="lp-stack-card__title">SOC2 &amp; Zero-Day Posture</div>
                <div className="lp-stack-card__domain">Agent #05 · Cybersecurity</div>
              </div>
              <span className="badge badge-p2 lp-stack-card__badge">P2 Moderate</span>
            </div>
            <p className="lp-stack-card__desc">
              Legacy Elasticsearch cluster unauthenticated on public subnet with EU PII records.
            </p>
            <div className="lp-stack-card__meter">
              <div className="lp-stack-card__meter-bar" style={{ width: '65%', background: 'var(--risk-p2)' }} />
            </div>
          </div>

          {/* Card 4: SHA-256 Cryptographic Verdict Seal */}
          <div className="glass-panel glass-panel--interactive lp-stack-card lp-stack-card--4">
            <div className="lp-stack-card__seal-content">
              <div className="lp-stack-card__seal-icon">
                <ShieldCheck size={28} />
              </div>
              <div className="lp-stack-card__seal-text">
                <div className="lp-stack-card__seal-title">IC Go/No-Go Decision Ready</div>
                <div className="lp-stack-card__seal-hash tabular-nums">
                  SHA-256: 8f4a1c9e...3d7b (Verified Tamper-Proof)
                </div>
              </div>
              <span className="badge badge-p3 lp-stack-card__seal-status">CAUTION</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live Telemetry Stats Ribbon ──────────────────────────────────────── */}
      <section className="lp-stats-section">
        <div className="lp-stats-grid">
          {STATS.map((s) => (
            <StatCounter key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* ── 9-Domain Interactive Bento Grid ──────────────────────────────────── */}
      <section className="lp-domains-section">
        <div className="lp-section-header">
          <div className="lp-section-badge">FULL-SPECTRUM COVERAGE</div>
          <h2 className="lp-section-title">9 Diligence Domains. Zero Blind Spots.</h2>
          <p className="lp-section-subtitle">
            Every specialist agent runs concurrently via isolated analytical reasoning routines.
            No sequential consulting bottlenecks.
          </p>
        </div>

        <div className="lp-domains-grid">
          {DOMAINS.map((d) => {
            const Icon = d.icon;
            return (
              <div
                key={d.name}
                className="glass-panel glass-panel--interactive lp-domain-card"
                style={{ '--card-glow': d.colorVar }}
              >
                <div className="lp-domain-card__icon-well" style={{ color: d.colorVar }}>
                  <Icon size={24} />
                </div>
                <h3 className="lp-domain-card__name">{d.name}</h3>
                <p className="lp-domain-card__desc">{d.desc}</p>
                <div className="lp-domain-card__footer">
                  <span className="pulse-dot" style={{ background: d.colorVar }} />
                  <span className="lp-domain-card__status">Active Neural Reasoning</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 5-Stage Forensic Pipeline Timeline ────────────────────────────────── */}
      <section className="lp-how-section">
        <div className="lp-section-header">
          <div className="lp-section-badge">AUTONOMOUS ORCHESTRATION</div>
          <h2 className="lp-section-title">The 5-Stage Diligence Pipeline</h2>
          <p className="lp-section-subtitle">
            From raw data room ingestion to an investment committee-ready cryptographic report.
          </p>
        </div>

        <div className="lp-timeline">
          {[
            {
              step: '01',
              title: 'Virtual Data Room Ingestion',
              desc: 'Drag & drop confidential PDFs, DOCX, XLSX spreadsheets, and presentations. Automated OCR and multi-format chunking.',
              icon: FileSearch,
            },
            {
              step: '02',
              title: 'Parallel Domain Decomposition',
              desc: '9 specialist agents analyze documents simultaneously with zero cross-talk bias, extracting discrete forensic line-item findings.',
              icon: Cpu,
            },
            {
              step: '03',
              title: 'Cross-Domain Compound Synthesis',
              desc: 'Synthesis engine maps compound liabilities (e.g. how a key employee IP clause in HR voids valuation multiples in Finance).',
              icon: GitMerge,
            },
            {
              step: '04',
              title: '5-Gate Hallucination Quality Filters',
              desc: 'Every finding must cite exact file names, page numbers, and verbatim quotes. Unbacked claims are automatically discarded.',
              icon: CheckCircle2,
            },
            {
              step: '05',
              title: 'Cryptographic IC Verdict Dossier',
              desc: 'Delivers a definitive Go / Caution / No-Go verdict with an executive summary and domain risk scores sealed with SHA-256 integrity.',
              icon: ShieldCheck,
            },
          ].map((item, idx) => {
            const StepIcon = item.icon;
            return (
              <div key={item.step} className="lp-timeline-step glass-panel glass-panel--interactive">
                <div className="lp-timeline-step__laser-node">
                  <span className="lp-timeline-step__number tabular-nums">{item.step}</span>
                </div>
                <div className="lp-timeline-step__body">
                  <div className="lp-timeline-step__top">
                    <div className="lp-timeline-step__icon">
                      <StepIcon size={18} />
                    </div>
                    <h3 className="lp-timeline-step__title">{item.title}</h3>
                  </div>
                  <p className="lp-timeline-step__desc">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Bottom Institutional CTA ─────────────────────────────────────────── */}
      <section className="lp-cta-section">
        <div className="glass-panel lp-cta-card">
          <div className="lp-cta-card__glow" />
          <div className="lp-cta-card__badge">
            <Zap size={14} />
            <span>ACCELERATE YOUR NEXT ACQUISITION</span>
          </div>
          <h2 className="lp-cta-card__title">
            Ready to audit your next M&amp;A transaction?
          </h2>
          <p className="lp-cta-card__sub">
            Deploy AcquiSense in under 2 minutes. Protect your fund from undisclosed liabilities.
          </p>
          <Link to="/new" className="btn btn-primary lp-cta-card__btn">
            <span>Deploy Deal Analysis Room</span>
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
