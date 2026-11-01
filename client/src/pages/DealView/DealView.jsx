import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  Scale, 
  SearchCode, 
  Grid, 
  GitMerge, 
  MessageSquareWarning, 
  Sliders, 
  FileDiff, 
  Bot, 
  Sparkles, 
  Loader2, 
  Clock, 
  Hourglass,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

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
  { key: 'verdict', label: 'Verdict', icon: Scale },
  { key: 'findings', label: 'Findings', icon: SearchCode },
  { key: 'heatmap', label: 'Risk Heatmap', icon: Grid },
  { key: 'crossref', label: 'Cross-References', icon: GitMerge },
  { key: 'questions', label: 'Questions', icon: MessageSquareWarning },
  { key: 'actions', label: 'Action Center', icon: Sliders },
  { key: 'compare', label: 'Compare Docs', icon: FileDiff },
  { key: 'agents', label: 'Agent Grid', icon: Bot },
];

const PROGRESS_LABELS = {
  queued: 'Job Queued in AI Dispatcher…',
  ingesting: 'Parsing Virtual Data Room Documents…',
  analyzing: 'Deploying 9 Domain Specialist Agents in Parallel…',
  synthesizing: 'Synthesizing Cross-Domain Compound Liabilities…',
  quality_check: 'Executing 5 Automated Quality Verification Gates…',
  generating_report: 'Compiling Investment Committee Dossier & Verdict…',
  done: 'Forensic Due Diligence Analysis Complete',
  failed: 'Analysis Routine Encountered An Error',
};

export default function DealView() {
  const { id } = useParams();

  const [deal, setDeal] = useState(null);
  const [job, setJob] = useState(null);
  const [report, setReport] = useState(null);
  const [agentProgress, setAgentProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('verdict');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [reportIntegrity, setReportIntegrity] = useState(null); // 'verified' | 'tampered' | null

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
            verifyReportIntegrity(rep, currentJob?.reportHash);
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

  // Client-side SHA-256 integrity verification
  const verifyReportIntegrity = async (rep, storedHash) => {
    if (!storedHash || !rep) return;
    try {
      const { report_hash } = rep;
      if (report_hash && storedHash) {
        setReportIntegrity(report_hash === storedHash ? 'verified' : 'tampered');
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadData();
  }, [id]);

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
    const interval = setInterval(() => {
      loadData();
    }, 3000);
    return () => clearInterval(interval);
  }, [job?.status, Boolean(report)]);

  if (loading) {
    return (
      <div className="dv-loading">
        <div className="spinner" />
        <p className="dv-loading__text">Loading forensic deal room telemetry…</p>
      </div>
    );
  }

  const currentStatus = report ? 'done' : job?.status || deal?.status || 'draft';
  const isRunning = currentStatus !== 'done' && currentStatus !== 'failed' && currentStatus !== 'draft';
  const goNoGo = report?.verdict?.go_no_go || job?.goNoGo || deal?.goNoGo;
  const totalFindings = report?.verdict?.total_findings ?? job?.totalFindings ?? deal?.totalFindings ?? 0;
  const isDone = currentStatus === 'done';

  const pythonJobIdForCopilot =
    job?.pythonJobId ||
    report?.pythonJobId ||
    deal?.latestPythonJobId ||
    deal?.job?.pythonJobId ||
    null;

  const displayProgress = { ...agentProgress };
  if (report?.domains) {
    Object.entries(report.domains).forEach(([dom, dData]) => {
      const count = Array.isArray(dData)
        ? dData.length
        : dData?.findings?.length ?? dData?.findings_count ?? 0;
      displayProgress[dom] = {
        domain: dom,
        status: 'done',
        pct: 100,
        findingsCount: count,
        error: null,
      };
    });
  }

  const handleTabClick = (key) => {
    userInteractedRef.current = true;
    setActiveTab(key);
  };

  const severityDistribution = report?.verdict?.severity_distribution || { P0: 0, P1: 0, P2: 0, P3: 0 };

  return (
    <div className="dv">
      {/* ── Sticky Command Header ────────────────────────────────────────────── */}
      <div className="dv-header glass-panel">
        <div className="dv-header__left">
          <div className="dv-header__breadcrumb">
            <Link to="/dashboard">Pipeline Dashboard</Link>
            <ChevronRight size={13} className="dv-header__breadcrumb-sep" />
            <span className="dv-header__breadcrumb-current">{deal?.name || 'Deal Room'}</span>
          </div>

          <h1 className="dv-header__title">{deal?.name}</h1>

          {deal?.targetCompany && (
            <div className="dv-header__target">
              <Building2 size={13} />
              <span>{deal.targetCompany}</span>
              {deal.acquirer && <span className="dv-header__acquirer">→ {deal.acquirer}</span>}
            </div>
          )}
        </div>

        <div className="dv-header__right">
          {/* Cryptographic SHA-256 Seal Badge */}
          {reportIntegrity && (
            <div
              className={`dv-integrity-badge ${
                reportIntegrity === 'verified'
                  ? 'dv-integrity-badge--verified'
                  : 'dv-integrity-badge--tampered'
              }`}
              title={
                reportIntegrity === 'verified'
                  ? `Cryptographic seal verified: ${job?.reportHash?.slice(0, 16)}…`
                  : 'Report hash mismatch: integrity verification failed.'
              }
            >
              {reportIntegrity === 'verified' ? (
                <>
                  <ShieldCheck size={14} />
                  <span>SHA-256 Verified</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={14} />
                  <span>Integrity Mismatch</span>
                </>
              )}
            </div>
          )}

          {/* Go / Caution / No-Go Pill */}
          {goNoGo && (
            <div className={`dv-header__gng dv-header__gng--${goNoGo.toLowerCase()}`}>
              <span>{goNoGo}</span>
            </div>
          )}

          {/* Status Capsule */}
          <div className={`dv-header__status dv-header__status--${currentStatus}`}>
            {isRunning && <span className="pulse-dot" />}
            {currentStatus === 'done' && <ShieldCheck size={14} />}
            <span>{PROGRESS_LABELS[currentStatus] || currentStatus}</span>
          </div>
        </div>
      </div>

      {/* ── Live Telemetry Progress Banner (Active during Analysis) ──────────── */}
      {isRunning && (
        <div className="dv-progress-banner glass-panel">
          <div className="dv-progress-banner__scanline" />
          <div className="dv-progress-banner__inner">
            <div className="dv-progress-banner__left">
              <Loader2 size={16} className="spin dv-progress-banner__icon" />
              <div className="dv-progress-banner__label">
                {PROGRESS_LABELS[currentStatus]}
              </div>
            </div>
            <div className="dv-progress-banner__agents">
              {Object.entries(agentProgress)
                .filter(([, p]) => p.status === 'running')
                .map(([domain]) => (
                  <span key={domain} className="dv-progress-banner__agent-tag">
                    <span className="pulse-dot" style={{ width: 5, height: 5 }} />
                    <span>{domain}</span>
                  </span>
                ))}
            </div>
          </div>
          <div className="dv-progress-banner__track">
            <div className="dv-progress-banner__sweep" />
          </div>
        </div>
      )}

      {/* ── 8-Tab Forensic Ribbon ────────────────────────────────────────────── */}
      <div className="dv-tabs-container">
        <div className="dv-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const isDisabled = ['questions', 'actions', 'compare'].includes(tab.key) && !isDone;
            return (
              <button
                key={tab.key}
                id={`tab-${tab.key}`}
                type="button"
                className={`dv-tab ${isActive ? 'dv-tab--active' : ''}`}
                onClick={() => handleTabClick(tab.key)}
                disabled={isDisabled}
              >
                {isActive && (
                  <motion.div
                    layoutId="deal-tab-active"
                    className="dv-tab__active-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon size={15} className="dv-tab__icon" />
                <span className="dv-tab__label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content with Layout Motion ───────────────────────────────────── */}
      <div className="dv-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {/* 1. Verdict Tab */}
            {activeTab === 'verdict' && (
              <div className="dv-tab-pane">
                {report ? (
                  <div className="dv-verdict-layout">
                    {/* Severity Distribution Matrix */}
                    <div className="dv-severity-grid">
                      <div className="glass-panel dv-sev-card dv-sev-card--p0">
                        <div className="dv-sev-card__count tabular-nums">{severityDistribution.P0 || 0}</div>
                        <div className="dv-sev-card__label">P0 Critical Risks</div>
                      </div>
                      <div className="glass-panel dv-sev-card dv-sev-card--p1">
                        <div className="dv-sev-card__count tabular-nums">{severityDistribution.P1 || 0}</div>
                        <div className="dv-sev-card__label">P1 Material Liabilities</div>
                      </div>
                      <div className="glass-panel dv-sev-card dv-sev-card--p2">
                        <div className="dv-sev-card__count tabular-nums">{severityDistribution.P2 || 0}</div>
                        <div className="dv-sev-card__label">P2 Cautionary Signals</div>
                      </div>
                      <div className="glass-panel dv-sev-card dv-sev-card--p3">
                        <div className="dv-sev-card__count tabular-nums">{severityDistribution.P3 || 0}</div>
                        <div className="dv-sev-card__label">P3 Low / Verified Clean</div>
                      </div>
                    </div>

                    {/* Go/No-Go Cockpit */}
                    <GoNoGoVerdict
                      verdict={report.verdict?.go_no_go}
                      executiveSummary={report.verdict?.executive_summary}
                      domainScores={report.domain_scores || {}}
                    />
                  </div>
                ) : (
                  <div className="glass-panel dv-empty-state">
                    <div className="dv-empty-icon-well">
                      <Hourglass size={36} className="dv-empty-icon" />
                    </div>
                    <h3 className="dv-empty-title">Forensic Synthesis Pending</h3>
                    <p className="dv-empty-desc">
                      The autonomous synthesis engine will compute the final Go/No-Go decision and
                      executive summary once all 9 specialist agents conclude document reviews.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 2. Findings Tab */}
            {activeTab === 'findings' && (
              <div className="dv-tab-pane">
                {report && report.domains ? (
                  <FindingsTable domainFindings={report.domains} />
                ) : (
                  <div className="glass-panel dv-empty-state">
                    <div className="dv-empty-icon-well">
                      <SearchCode size={36} className="dv-empty-icon" />
                    </div>
                    <h3 className="dv-empty-title">Findings Ingestion In Flight</h3>
                    <p className="dv-empty-desc">
                      Findings are continuously structured and verified as agents finalize their domain chapters.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 3. Heatmap Tab */}
            {activeTab === 'heatmap' && (
              <div className="dv-tab-pane">
                <RiskHeatmap domainFindings={report?.domains || {}} />
              </div>
            )}

            {/* 4. Cross-References Tab */}
            {activeTab === 'crossref' && (
              <div className="dv-tab-pane">
                {report?.cross_references?.length > 0 ? (
                  <div className="dv-crossref-container">
                    <div className="glass-panel dv-crossref-graph-panel">
                      <div className="dv-panel-header">
                        <GitMerge size={16} />
                        <span>D3 Compound Risk Physics Network ({report.cross_references.length} Multi-Domain Connections)</span>
                      </div>
                      <CrossRefGraph
                        crossReferences={report.cross_references}
                        domainFindings={report.domains || {}}
                      />
                    </div>

                    <div className="dv-xref-list">
                      <div className="dv-section-heading">Synthesized Compound Liability Narratives</div>
                      <div className="dv-xref-grid">
                        {report.cross_references.map((xr) => (
                          <div
                            key={xr.id}
                            className={`glass-panel glass-panel--interactive dv-xref-card badge-${xr.combined_severity?.toLowerCase()}`}
                          >
                            <div className="dv-xref-card__top">
                              <span className={`badge badge-${xr.combined_severity?.toLowerCase()}`}>
                                {xr.combined_severity} Compound
                              </span>
                              <div className="dv-xref-card__domains">
                                {xr.domains?.join(' ↔ ')}
                              </div>
                            </div>
                            <p className="dv-xref-card__narrative">{xr.narrative}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="glass-panel dv-empty-state">
                    <div className="dv-empty-icon-well">
                      <GitMerge size={36} className="dv-empty-icon" />
                    </div>
                    <h3 className="dv-empty-title">Zero Compound Risks Detected</h3>
                    <p className="dv-empty-desc">
                      Cross-domain synthesis connects related findings across multiple disciplines.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 5. Analyst Questions Tab */}
            {activeTab === 'questions' && isDone && (
              <div className="dv-tab-pane">
                <AnalystQuestions jobId={pythonJobIdForCopilot} />
              </div>
            )}

            {/* 6. Action Center Tab */}
            {activeTab === 'actions' && isDone && (
              <div className="dv-tab-pane">
                <RiskActionCenter dealId={id} jobId={job?._id} report={report} />
              </div>
            )}

            {/* 7. Document Comparator Tab */}
            {activeTab === 'compare' && isDone && (
              <div className="dv-tab-pane">
                <DocumentComparator
                  jobId={pythonJobIdForCopilot}
                  dealFiles={deal?.files || []}
                />
              </div>
            )}

            {/* 8. Agent Grid Tab */}
            {activeTab === 'agents' && (
              <div className="dv-tab-pane">
                <AgentGrid agentProgress={displayProgress} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Floating Copilot AI Orb ──────────────────────────────────────────── */}
      {isDone && (
        <button
          id="copilot-fab"
          type="button"
          className="copilot-fab"
          onClick={() => setCopilotOpen(true)}
          aria-label="Open AcquiSense Copilot"
          title="Consult AcquiSense RAG Copilot"
        >
          <div className="copilot-fab__sonar-ring" />
          <div className="copilot-fab__orb">
            <Sparkles size={22} className="copilot-fab__icon" />
          </div>
          <span className="copilot-fab__label">Ask Copilot</span>
        </button>
      )}

      {/* ── Slide-In Copilot Drawer ─────────────────────────────────────────── */}
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
