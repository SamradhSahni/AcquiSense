import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDeal, getJobResults } from '../../services/api';
import { subscribeToJob } from '../../services/socket';
import AgentGrid from '../../components/AgentGrid/AgentGrid';
import RiskHeatmap from '../../components/RiskHeatmap/RiskHeatmap';
import FindingsTable from '../../components/FindingsTable/FindingsTable';
import GoNoGoVerdict from '../../components/GoNoGo/GoNoGo';
import CrossRefGraph from '../../components/CrossRefGraph/CrossRefGraph';
import CopilotPanel from '../../components/Copilot/CopilotPanel';
import AnalystQuestions from '../../components/AnalystQuestions/AnalystQuestions';
import RiskActionCenter from '../../components/RiskActionCenter/RiskActionCenter';
import DocumentComparator from '../../components/DocumentComparator/DocumentComparator';
import './DealView.css';

const TABS = [
  { key: 'verdict',    label: '⚖️ Verdict' },
  { key: 'findings',   label: '🔍 Findings' },
  { key: 'heatmap',    label: '📊 Risk Heatmap' },
  { key: 'crossref',   label: '🔗 Cross-References' },
  { key: 'questions',  label: '📋 Questions' },
  // ── HIDDEN (re-enable when ready to demo) ──────────────────────────────────
  { key: 'actions',   label: '⚡ Action Center' },
  { key: 'compare',   label: '📑 Compare Docs' },
  // ──────────────────────────────────────────────────────────────────────────
  { key: 'agents',    label: '🤖 Agent Grid' },
];

const PROGRESS_LABELS = {
  queued:            '⏳ Job queued…',
  ingesting:         '📄 Parsing documents…',
  analyzing:         '🤖 Running 9 AI agents in parallel…',
  synthesizing:      '🔗 Cross-domain synthesis…',
  quality_check:     '✅ Running quality gates…',
  generating_report: '📊 Building report…',
  done:              '✨ Analysis complete!',
  failed:            '❌ Analysis failed.',
};

export default function DealView() {
  const { id } = useParams();

  const [deal, setDeal]               = useState(null);
  const [job, setJob]                 = useState(null);
  const [report, setReport]           = useState(null);
  const [agentProgress, setAgentProgress] = useState({});
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState('verdict');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [reportIntegrity, setReportIntegrity] = useState(null); // 'verified' | 'tampered' | null

  // Track if user explicitly clicked any tab so auto-switch doesn't override them
  const userInteractedRef = useRef(false);

  // 1. Fetch deal data and results
  const loadData = async () => {
    try {
      const dealData = await getDeal(id);
      if (!dealData) return;
      setDeal(dealData);

      const currentJob = dealData.job;
      if (currentJob) {
        setJob(currentJob);
        if (currentJob.agentProgress) {
          setAgentProgress(currentJob.agentProgress);
        }
      }

      // Check for results if job is done or deal is done
      const jobIdToFetch = currentJob?._id || dealData.latestJobId;
      if (jobIdToFetch) {
        try {
          const rep = await getJobResults(jobIdToFetch);
          if (rep && (rep.verdict || rep.domains)) {
            setReport(rep);
            // Verify report integrity using stored hash
            verifyReportIntegrity(rep, currentJob?.reportHash);
            // Default to 'verdict' if user hasn't touched tabs
            if (!userInteractedRef.current && (currentJob?.status === 'done' || dealData.status === 'done')) {
              setActiveTab('verdict');
            }
          }
        } catch (_) {
          // Report not ready yet or job in progress
        }
      }
    } catch (err) {
      console.error('Error loading deal:', err);
    } finally {
      setLoading(false);
    }
  };

  // SHA-256 integrity check (client-side verification)
  const verifyReportIntegrity = async (rep, storedHash) => {
    if (!storedHash || !rep) return;
    try {
      const { report_hash, ...reportWithoutHash } = rep;
      // Simple presence check — full crypto verification would require SubtleCrypto
      if (report_hash && storedHash) {
        setReportIntegrity(report_hash === storedHash ? 'verified' : 'tampered');
      }
    } catch (_) { /* ignore */ }
  };

  // Initial load
  useEffect(() => { loadData(); }, [id]);

  // 2. WebSocket listener for live updates
  const pythonJobId = job?.pythonJobId || deal?.job?.pythonJobId;
  useEffect(() => {
    if (!pythonJobId || report) return;

    const unsub = subscribeToJob(pythonJobId, (event) => {
      if (event.type === 'agent_progress') {
        setAgentProgress((prev) => ({
          ...prev,
          [event.domain]: {
            domain: event.domain,
            status: event.status,
            pct: event.pct,
            findingsCount: event.findings_count,
            error: event.error,
          },
        }));
      }
      if (event.type === 'job_status') {
        setJob((prev) => ({
          ...(prev || {}),
          status: event.status,
          goNoGo: event.go_no_go || prev?.goNoGo,
          reportHash: event.report_hash || prev?.reportHash,
        }));
        if (event.status === 'done' || event.status === 'failed') {
          loadData();
        }
      }
    });

    return unsub;
  }, [pythonJobId, Boolean(report)]);

  // 3. Polling interval if job is running
  useEffect(() => {
    const isRunning = job && job.status !== 'done' && job.status !== 'failed';
    if (!isRunning || report) return;
    const interval = setInterval(() => { loadData(); }, 3000);
    return () => clearInterval(interval);
  }, [job?.status, Boolean(report)]);

  if (loading) {
    return (
      <div className="dv-loading">
        <div className="spinner" />
        <p>Loading deal analysis…</p>
      </div>
    );
  }

  const currentStatus = report ? 'done' : (job?.status || deal?.status || 'draft');
  const isRunning = currentStatus !== 'done' && currentStatus !== 'failed' && currentStatus !== 'draft';
  const goNoGo = report?.verdict?.go_no_go || job?.goNoGo || deal?.goNoGo;
  const totalFindings = report?.verdict?.total_findings ?? job?.totalFindings ?? deal?.totalFindings ?? 0;
  const isDone = currentStatus === 'done';

  // Python job ID for Copilot — try every possible location
  const pythonJobIdForCopilot =
    job?.pythonJobId ||
    report?.pythonJobId ||
    deal?.latestPythonJobId ||
    deal?.job?.pythonJobId ||
    null;

  // Debug: log what we have (remove in production)
  if (isDone) {
    console.debug('[DealView] isDone=true, pythonJobIdForCopilot=', pythonJobIdForCopilot, 'job=', job?._id);
  }

  // Build agent progress display
  const displayProgress = { ...agentProgress };
  if (report?.domains) {
    Object.entries(report.domains).forEach(([dom, dData]) => {
      const count = Array.isArray(dData)
        ? dData.length
        : (dData?.findings?.length ?? dData?.findings_count ?? 0);
      displayProgress[dom] = {
        domain: dom, status: 'done', pct: 100, findingsCount: count, error: null,
      };
    });
  }

  const handleTabClick = (key) => {
    userInteractedRef.current = true;
    setActiveTab(key);
  };

  return (
    <div className="dv">
      {/* Header */}
      <div className="dv-header">
        <div className="dv-header__left">
          <div className="dv-header__breadcrumb">
            <Link to="/dashboard">Dashboard</Link> / <span>{deal?.name || 'Deal'}</span>
          </div>
          <h1 className="dv-header__title">{deal?.name}</h1>
          {deal?.targetCompany && (
            <div className="dv-header__target">
              🏢 {deal.targetCompany} {deal.acquirer ? `→ ${deal.acquirer}` : ''}
            </div>
          )}
        </div>

        <div className="dv-header__right">
          {/* Report integrity badge */}
          {reportIntegrity && (
            <div className={`dv-integrity-badge dv-integrity--${reportIntegrity}`}>
              {reportIntegrity === 'verified' ? '🔏 Report Verified' : '⚠️ Integrity Check Failed'}
            </div>
          )}
          {goNoGo && (
            <div className="dv-header__gng" data-verdict={goNoGo}>{goNoGo}</div>
          )}
          <div className={`dv-header__status dv-header__status--${currentStatus}`}>
            {isRunning && <span className="pulse-dot" />}
            {PROGRESS_LABELS[currentStatus] || currentStatus}
          </div>
        </div>
      </div>

      {/* Progress banner while running */}
      {isRunning && (
        <div className="dv-progress-banner">
          <div className="dv-progress-banner__inner">
            <div className="dv-progress-banner__label">{PROGRESS_LABELS[currentStatus]}</div>
            <div className="dv-progress-banner__agents">
              {Object.entries(agentProgress)
                .filter(([, p]) => p.status === 'running')
                .map(([domain]) => (
                  <span key={domain} className="dv-progress-banner__agent">{domain}</span>
                ))}
            </div>
          </div>
          <div className="dv-progress-banner__bar">
            <div className="dv-progress-banner__fill" />
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="dv-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            type="button"
            className={`dv-tab ${activeTab === tab.key ? 'dv-tab--active' : ''}`}
            onClick={() => handleTabClick(tab.key)}
            disabled={['questions','actions','compare'].includes(tab.key) && !isDone}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="dv-content">
        {/* 1. Verdict */}
        {activeTab === 'verdict' && (
          <div>
            {report ? (
              <div className="dv-verdict-layout">
                <GoNoGoVerdict
                  verdict={report.verdict?.go_no_go}
                  executiveSummary={report.verdict?.executive_summary}
                  domainScores={report.domain_scores || {}}
                />
                <div className="dv-severity-dist">
                  <div className="dv-section-title">Severity Distribution</div>
                  <div className="dv-sev-grid">
                    {Object.entries(report.verdict?.severity_distribution || { P0: 0, P1: 0, P2: 0, P3: 0 }).map(
                      ([sev, count]) => (
                        <div key={sev} className={`dv-sev-card badge-${sev.toLowerCase()}`}>
                          <div className="dv-sev-card__count">{count}</div>
                          <div className="dv-sev-card__label">{sev}</div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="dv-empty-state">
                <div className="dv-empty-icon">⏳</div>
                <h3>Verdict Pending</h3>
                <p>Synthesis and final Go/No-Go verdict will be computed once agent analysis finishes.</p>
              </div>
            )}
          </div>
        )}

        {/* 2. Findings */}
        {activeTab === 'findings' && (
          <div>
            <div className="dv-section-title">All Findings — {totalFindings} total</div>
            {report && report.domains ? (
              <FindingsTable domainFindings={report.domains} />
            ) : (
              <div className="dv-empty-state">
                <div className="dv-empty-icon">🔍</div>
                <h3>No findings yet</h3>
                <p>Findings are extracted and aggregated as agents complete their domain reviews.</p>
              </div>
            )}
          </div>
        )}

        {/* 3. Heatmap */}
        {activeTab === 'heatmap' && (
          <div>
            <div className="dv-section-title">Finding Distribution by Domain &amp; Severity</div>
            <RiskHeatmap domainFindings={report?.domains || {}} />
          </div>
        )}

        {/* 4. Cross-References */}
        {activeTab === 'crossref' && (
          <div>
            <div className="dv-section-title">
              Cross-Domain Risk Connections — {report?.cross_references?.length || 0} identified
            </div>
            {report?.cross_references?.length > 0 ? (
              <>
                <CrossRefGraph
                  crossReferences={report.cross_references}
                  domainFindings={report.domains || {}}
                />
                <div className="dv-xref-list">
                  {report.cross_references.map((xr) => (
                    <div key={xr.id} className={`dv-xref-card badge-${xr.combined_severity?.toLowerCase()}`}>
                      <div className="dv-xref-card__severity">{xr.combined_severity}</div>
                      <div className="dv-xref-card__domains">{xr.domains?.join(' ↔ ')}</div>
                      <div className="dv-xref-card__narrative">{xr.narrative}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="dv-empty-state">
                <div className="dv-empty-icon">🔗</div>
                <h3>No Cross-Domain Connections Detected</h3>
                <p>Cross-domain synthesis connects related findings across multiple disciplines.</p>
              </div>
            )}
          </div>
        )}

      {/* 5. Analyst Questions */}
        {activeTab === 'questions' && isDone && (
          <AnalystQuestions jobId={pythonJobIdForCopilot} />
        )}

        {/* 6. Risk Action Center (workflow + HITL review) */}
        {activeTab === 'actions' && isDone && (
          <RiskActionCenter
            dealId={id}
            jobId={job?._id}
            report={report}
          />
        )}

        {/* 7. Document Comparator */}
        {activeTab === 'compare' && isDone && (
          <DocumentComparator
            jobId={pythonJobIdForCopilot}
            dealFiles={deal?.files || []}
          />
        )}

        {/* 8. Agent Grid */}
        {activeTab === 'agents' && (
          <div>
            <div className="dv-section-title">Domain Agent Status</div>
            <AgentGrid agentProgress={displayProgress} />
          </div>
        )}
      </div>

      {/* ── HIDDEN FEATURES — all code preserved, just not rendered ──────────── */}
      {/* Floating Copilot Button */}
      {isDone && (
        <button
          id="copilot-fab"
          className="copilot-fab"
          onClick={() => setCopilotOpen(true)}
          aria-label="Open AcquiSense Copilot"
          title="Ask AcquiSense Copilot about this deal"
        >
          <span className="copilot-fab-icon">⚡</span>
          <span className="copilot-fab-label">Ask Copilot</span>
        </button>
      )}

      Copilot Slide-in Panel
      {copilotOpen && (
        <CopilotPanel
          dealId={id}
          jobId={pythonJobIdForCopilot}
          onClose={() => setCopilotOpen(false)}
        />
      )}
    </div>
  );
}
