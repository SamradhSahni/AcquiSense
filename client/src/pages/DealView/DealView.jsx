import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getDeal, getJob, getJobResults } from '../../services/api';
import { subscribeToJob } from '../../services/socket';
import AgentGrid from '../../components/AgentGrid/AgentGrid';
import RiskHeatmap from '../../components/RiskHeatmap/RiskHeatmap';
import FindingsTable from '../../components/FindingsTable/FindingsTable';
import GoNoGoVerdict from '../../components/GoNoGo/GoNoGo';
import CrossRefGraph from '../../components/CrossRefGraph/CrossRefGraph';
import './DealView.css';

const DONE_STATUSES = ['done', 'failed'];
const PROGRESS_LABELS = {
  queued: '⏳ Job queued…',
  ingesting: '📄 Parsing documents…',
  analyzing: '🤖 Running 9 AI agents in parallel…',
  synthesizing: '🔗 Cross-domain synthesis (GPT-4o)…',
  quality_check: '✅ Running quality gates…',
  generating_report: '📊 Building report…',
  done: '✨ Analysis complete!',
  failed: '❌ Analysis failed.',
};

const ACTIVE_TAB_KEY = 'dd_active_tab';

export default function DealView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const pythonJobId = searchParams.get('pythonJobId');
  const mongoJobId = searchParams.get('jobId');

  const [deal, setDeal] = useState(null);
  const [job, setJob] = useState(null);
  const [report, setReport] = useState(null);
  const [agentProgress, setAgentProgress] = useState({});
  const [activeTab, setActiveTab] = useState('agents');
  const [loading, setLoading] = useState(true);

  // Load initial deal + job
  useEffect(() => {
    const load = async () => {
      try {
        const [dealData] = await Promise.all([getDeal(id)]);
        setDeal(dealData);
        if (dealData.job) {
          setJob(dealData.job);
          if (dealData.job.agentProgress) {
            setAgentProgress(Object.fromEntries(
              Object.entries(dealData.job.agentProgress)
            ));
          }
        }
      } catch (e) {
        console.error('Failed to load deal:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Subscribe to live WebSocket progress
  useEffect(() => {
    if (!pythonJobId) return;

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
        setJob((prev) => ({ ...prev, status: event.status, goNoGo: event.go_no_go }));
        if (DONE_STATUSES.includes(event.status) && event.status === 'done') {
          // Fetch full results when done
          fetchResults();
        }
      }
    });

    return unsub;
  }, [pythonJobId]);

  const fetchResults = useCallback(async () => {
    if (!mongoJobId) return;
    try {
      const data = await getJobResults(mongoJobId);
      setReport(data);
      setActiveTab('verdict');
    } catch (e) {
      // Job might still be running — that's ok
    }
  }, [mongoJobId]);

  // Auto-fetch results if job is already done
  useEffect(() => {
    if (job?.status === 'done' && !report) fetchResults();
  }, [job?.status, report, fetchResults]);

  if (loading) return (
    <div className="dv-loading"><div className="spinner" /><p>Loading deal…</p></div>
  );

  const jobStatus = job?.status || 'draft';
  const isDone = jobStatus === 'done';
  const isRunning = !DONE_STATUSES.includes(jobStatus) && jobStatus !== 'draft';

  const TABS = [
    { key: 'agents', label: '🤖 Agent Grid' },
    { key: 'heatmap', label: '📊 Risk Heatmap' },
    isDone && { key: 'verdict', label: '⚖️ Verdict' },
    isDone && { key: 'findings', label: '🔍 Findings' },
    isDone && { key: 'crossref', label: '🔗 Cross-References' },
  ].filter(Boolean);

  return (
    <div className="dv">
      {/* Header */}
      <div className="dv-header">
        <div className="dv-header__left">
          <div className="dv-header__breadcrumb">
            <a href="/dashboard">Dashboard</a> / <span>{deal?.name}</span>
          </div>
          <h1 className="dv-header__title">{deal?.name}</h1>
          {deal?.targetCompany && (
            <div className="dv-header__target">🏢 {deal.targetCompany} → {deal?.acquirer || 'Undisclosed Acquirer'}</div>
          )}
        </div>
        <div className="dv-header__right">
          {job?.goNoGo && (
            <div
              className="dv-header__gng"
              data-verdict={job.goNoGo}
            >
              {job.goNoGo}
            </div>
          )}
          <div className={`dv-header__status dv-header__status--${jobStatus}`}>
            {isRunning && <span className="pulse-dot" />}
            {PROGRESS_LABELS[jobStatus] || jobStatus}
          </div>
        </div>
      </div>

      {/* Progress banner while running */}
      {isRunning && (
        <div className="dv-progress-banner">
          <div className="dv-progress-banner__inner">
            <div className="dv-progress-banner__label">{PROGRESS_LABELS[jobStatus]}</div>
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

      {/* Tabs */}
      <div className="dv-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`dv-tab ${activeTab === tab.key ? 'dv-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="dv-content">
        {activeTab === 'agents' && (
          <div>
            <div className="dv-section-title">Domain Agent Status</div>
            <AgentGrid agentProgress={agentProgress} />
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div>
            <div className="dv-section-title">Finding Distribution by Domain &amp; Severity</div>
            <RiskHeatmap domainFindings={report?.domains || {}} />
          </div>
        )}

        {activeTab === 'verdict' && report && (
          <div className="dv-verdict-layout">
            <GoNoGoVerdict
              verdict={report.verdict?.go_no_go}
              executiveSummary={report.verdict?.executive_summary}
              domainScores={report.domain_scores}
            />
            <div className="dv-severity-dist">
              <div className="dv-section-title">Severity Distribution</div>
              <div className="dv-sev-grid">
                {Object.entries(report.verdict?.severity_distribution || {}).map(([sev, count]) => (
                  <div key={sev} className={`dv-sev-card badge-${sev.toLowerCase()}`}>
                    <div className="dv-sev-card__count">{count}</div>
                    <div className="dv-sev-card__label">{sev}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'findings' && report && (
          <div>
            <div className="dv-section-title">All Findings — {report.verdict?.total_findings || 0} total</div>
            <FindingsTable domainFindings={report.domains || {}} />
          </div>
        )}

        {activeTab === 'crossref' && report && (
          <div>
            <div className="dv-section-title">Cross-Domain Risk Connections — {report.cross_references?.length || 0} identified</div>
            <CrossRefGraph
              crossReferences={report.cross_references || []}
              domainFindings={report.domains || {}}
            />
            {/* Cross-ref list */}
            <div className="dv-xref-list">
              {(report.cross_references || []).map((xr) => (
                <div key={xr.id} className={`dv-xref-card badge-${xr.combined_severity?.toLowerCase()}`}>
                  <div className="dv-xref-card__severity">{xr.combined_severity}</div>
                  <div className="dv-xref-card__domains">{xr.domains?.join(' ↔ ')}</div>
                  <div className="dv-xref-card__narrative">{xr.narrative}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
