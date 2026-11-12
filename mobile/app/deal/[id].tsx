import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import {
  ArrowLeft,
  Bot,
  Search,
  FileText,
  ShieldCheck,
  ShieldAlert,
  UploadCloud,
  RefreshCw,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Sliders,
  Rocket,
  CheckCircle2,
  Clock,
} from 'lucide-react-native';
import { SeverityBadge } from '../../src/components/ui/SeverityBadge';
import { GlowCard } from '../../src/components/ui/GlowCard';
import { SkiaForceGraph, GraphNode, GraphEdge } from '../../src/components/graph/SkiaForceGraph';
import { CitationsBottomSheet } from '../../src/components/citations/CitationsBottomSheet';
import { PocketCopilotDrawer } from '../../src/components/copilot/PocketCopilotDrawer';
import { FindingActionModal } from '../../src/components/actions/FindingActionModal';
import { VdrUploadModal } from '../../src/components/vdr/VdrUploadModal';
import { useDealStore, DealDossierTab } from '../../src/stores/useDealStore';
import { getEncryptedDb, searchFindingsFTS5 } from '../../src/db/client';
import { syncDealDeltaFromServer, upsertFindingsToVault } from '../../src/db/outboxWorker';
import { API_BASE_URL } from '../../src/services/api';
import {
  compareDocuments,
  downloadAndOpenWatermarkedPdf,
  getAnalystQuestions,
  getDeal,
  getDealFindings,
  getJobResults,
  startJob,
  syncJobFindings,
} from '../../src/services/webApi';
import {
  AnalystQuestion,
  ComparisonResult,
  Deal,
  DiligenceDomain,
  Finding,
  JobRecord,
  Severity,
} from '../../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DOMAINS: DiligenceDomain[] = [
  'legal',
  'finance',
  'commercial',
  'tech',
  'cyber',
  'hr',
  'tax',
  'regulatory',
  'esg',
];

const DOSSIER_TABS: Array<{ id: DealDossierTab; label: string }> = [
  { id: 'verdict', label: 'Verdict' },
  { id: 'findings', label: 'Findings' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'graph', label: 'Cross-Ref' },
  { id: 'analyst_q', label: 'Questions' },
  { id: 'actions', label: 'Action Center' },
  { id: 'compare', label: 'Compare Docs' },
  { id: 'agents', label: 'Agents' },
  { id: 'vdr', label: 'VDR Docs' },
];

export default function DealDossierScreen() {
  const router = useRouter();
  const { id: dealId } = useLocalSearchParams<{ id: string }>();
  const {
    selectedDeal,
    setSelectedDeal,
    activeTab,
    domainFilter,
    severityFilter,
    searchQuery,
    setActiveTab,
    setDomainFilter,
    setSeverityFilter,
    setSearchQuery,
    setCopilotOpen,
    setCitationsOpen,
  } = useDealStore();

  const [deal, setDeal] = useState<Deal | null>(selectedDeal);
  const [job, setJob] = useState<JobRecord | null>(selectedDeal?.job || null);
  const [report, setReport] = useState<any>(null);
  const [reportIntegrity, setReportIntegrity] = useState<'verified' | 'tampered' | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFindings, setSyncingFindings] = useState(false);

  // Analyst Questions state
  const [questions, setQuestions] = useState<AnalystQuestion[]>([]);
  const [questionsByDomain, setQuestionsByDomain] = useState<Record<string, AnalystQuestion[]>>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [qDomain, setQDomain] = useState<string>('all');
  const [expandedQ, setExpandedQ] = useState<Record<number, boolean>>({});

  // Document Comparator state
  const [fileA, setFileA] = useState('');
  const [fileB, setFileB] = useState('');
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const [compareResult, setCompareResult] = useState<ComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareFilter, setCompareFilter] = useState<'all' | 'changed' | 'new' | 'removed'>('all');

  // Action & Upload Modals
  const [actionFindingTarget, setActionFindingTarget] = useState<Finding | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [rerunningJob, setRerunningJob] = useState(false);

  const pythonJobId =
    job?.pythonJobId ||
    report?.pythonJobId ||
    deal?.latestPythonJobId ||
    deal?.job?.pythonJobId ||
    null;

  const loadLocalFindings = useCallback(() => {
    if (!dealId) return;
    try {
      const results = searchFindingsFTS5(
        dealId,
        searchQuery,
        domainFilter || undefined,
        severityFilter || undefined
      );
      setFindings(
        results.map((r: any) => ({
          id: r.id,
          _id: r.id,
          dealId: r.deal_id,
          domain: r.domain,
          severity: r.severity,
          title: r.title,
          description: r.description,
          evidence: r.evidence,
          citations: JSON.parse(r.citations_json || '[]'),
          tags: JSON.parse(r.tags_json || '[]'),
          workflowState: r.workflow_state,
          reviewStatus: r.review_status,
          assignedTo: r.assigned_to,
          dueDate: r.due_date,
          conditions: JSON.parse(r.conditions_json || '[]'),
          auditLog: JSON.parse(r.audit_log_json || '[]'),
          serverVersion: r.server_version,
          isDirty: r.is_dirty === 1,
          updatedAt: r.updated_at,
        }))
      );
    } catch (e) {
      console.warn('Error querying local SQLite findings:', e);
    } finally {
      setLoading(false);
    }
  }, [dealId, searchQuery, domainFilter, severityFilter]);

  const loadRemoteDealData = useCallback(async () => {
    if (!dealId) return;
    try {
      const serverDeal = await getDeal(dealId);
      if (serverDeal) {
        const normalized: Deal = { ...serverDeal, id: serverDeal._id || serverDeal.id };
        setDeal(normalized);
        setSelectedDeal(normalized);
        if (serverDeal.job) setJob(serverDeal.job);

        const jobIdToFetch = serverDeal.job?._id || serverDeal.latestJobId;
        if (jobIdToFetch) {
          try {
            const rep = await getJobResults(jobIdToFetch);
            if (rep && (rep.verdict || rep.domains)) {
              setReport(rep);
              if (rep.report_hash && serverDeal.job?.reportHash) {
                setReportIntegrity(
                  rep.report_hash === serverDeal.job.reportHash ? 'verified' : 'tampered'
                );
              }
              // Seed findings from report if Mongo findings collection isn't synced yet
              const fRes = await getDealFindings(dealId, { limit: 150 }).catch(() => null);
              if (fRes?.findings?.length) {
                upsertFindingsToVault(dealId, fRes.findings);
              } else {
                await syncJobFindings(jobIdToFetch).catch(() => {});
                const after = await getDealFindings(dealId, { limit: 150 }).catch(() => null);
                if (after?.findings?.length) {
                  upsertFindingsToVault(dealId, after.findings);
                } else if (rep.domains) {
                  const flattened: any[] = [];
                  Object.entries(rep.domains).forEach(([dom, dVal]: [string, any]) => {
                    const list = Array.isArray(dVal) ? dVal : dVal?.findings || [];
                    list.forEach((item: any, idx: number) => {
                      flattened.push({
                        id: item.id || `${jobIdToFetch}_${dom}_${idx}`,
                        dealId,
                        domain: dom,
                        severity: item.severity || 'P2',
                        title: item.title || 'Finding',
                        description: item.description || '',
                        evidence: item.evidence || '',
                        citations: item.citations || [],
                        tags: item.tags || [],
                      });
                    });
                  });
                  upsertFindingsToVault(dealId, flattened);
                }
              }
            }
          } catch {
            // Job still running or no report yet
          }
        }
      }
      await syncDealDeltaFromServer(dealId).catch(() => {});
    } catch {
      // Offline mode: fall back to SQLite vault
    } finally {
      loadLocalFindings();
    }
  }, [dealId, loadLocalFindings]);

  useEffect(() => {
    loadLocalFindings();
  }, [loadLocalFindings]);

  useEffect(() => {
    loadRemoteDealData();
  }, [dealId]);

  // Live Socket.IO + Polling while analysis is in flight
  useEffect(() => {
    const status = job?.status || deal?.status;
    const isRunning = status && status !== 'done' && status !== 'failed' && status !== 'draft';
    if (!isRunning || report) return;

    let socket: Socket | null = null;
    try {
      socket = io(API_BASE_URL, { transports: ['websocket', 'polling'], timeout: 5000 });
      if (pythonJobId) {
        socket.emit('subscribe_job', pythonJobId);
      }
      socket.on('agent_progress', (ev: any) => {
        if (ev.domain) {
          setJob((prev) => ({
            ...(prev || { dealId: dealId || '', status: 'analyzing' }),
            agentProgress: {
              ...(prev?.agentProgress || {}),
              [ev.domain]: {
                domain: ev.domain,
                status: ev.status,
                pct: ev.pct,
                findingsCount: ev.findings_count,
                error: ev.error,
              },
            },
          }));
        }
      });
      socket.on('job_status', (ev: any) => {
        if (ev.status === 'done' || ev.status === 'failed') {
          loadRemoteDealData();
        }
      });
    } catch {
      // ignore
    }

    const timer = setInterval(() => {
      loadRemoteDealData();
    }, 3500);

    return () => {
      clearInterval(timer);
      if (socket) socket.disconnect();
    };
  }, [job?.status, deal?.status, pythonJobId, Boolean(report)]);

  // Fetch Analyst Questions when tab opens
  useEffect(() => {
    if (activeTab === 'analyst_q' && pythonJobId && questions.length === 0 && !questionsLoading) {
      setQuestionsLoading(true);
      getAnalystQuestions(pythonJobId)
        .then((res) => {
          setQuestions(res?.questions || []);
          setQuestionsByDomain(res?.by_domain || {});
        })
        .catch(() => {})
        .finally(() => setQuestionsLoading(false));
    }
  }, [activeTab, pythonJobId]);

  const handleSyncFindings = async () => {
    const jId = job?._id || deal?.latestJobId;
    if (!jId) {
      Alert.alert('No Job Found', 'Run an AI analysis job on uploaded VDR files first.');
      return;
    }
    setSyncingFindings(true);
    try {
      const res = await syncJobFindings(jId);
      await loadRemoteDealData();
      Alert.alert('Findings Synced', res?.message || 'Action Center synced with latest report.');
    } catch (err: any) {
      Alert.alert('Sync Failed', err?.response?.data?.error || err?.message || 'Unable to sync.');
    } finally {
      setSyncingFindings(false);
    }
  };

  const handleRunComparison = async () => {
    if (!pythonJobId) {
      Alert.alert('Analysis Required', 'Complete an AI diligence run before comparing documents.');
      return;
    }
    if (!fileA.trim() || !fileB.trim() || fileA.trim() === fileB.trim()) {
      Alert.alert('Select Two Documents', 'Choose two different baseline and revised documents.');
      return;
    }
    setComparing(true);
    setCompareResult(null);
    try {
      const res = await compareDocuments(pythonJobId, {
        file_a: fileA.trim(),
        file_b: fileB.trim(),
        name_a: nameA.trim() || fileA.trim(),
        name_b: nameB.trim() || fileB.trim(),
      });
      setCompareResult(res);
    } catch (err: any) {
      Alert.alert(
        'Comparison Failed',
        err?.response?.data?.detail || err?.response?.data?.error || err?.message
      );
    } finally {
      setComparing(false);
    }
  };

  const handleReRunAnalysis = async () => {
    if (!dealId) return;
    const fileNames = (deal?.files || []).map((f) => f.savedName).filter(Boolean);
    if (fileNames.length === 0) {
      Alert.alert('No VDR Files', 'Upload at least one VDR document first.');
      setUploadModalOpen(true);
      return;
    }
    setRerunningJob(true);
    try {
      const started = await startJob(dealId, fileNames, deal?.modelProfile || 'standard');
      setReport(null);
      setJob({
        _id: started.jobId,
        dealId,
        pythonJobId: started.pythonJobId,
        status: 'queued',
      });
      setActiveTab('agents');
      Alert.alert('13 Agents Dispatched', 'Live analysis started on your VDR files.');
    } catch (err: any) {
      Alert.alert('Launch Failed', err?.response?.data?.error || err?.message);
    } finally {
      setRerunningJob(false);
    }
  };

  const handleDownloadWatermarked = async (fileId: string, originalName: string) => {
    if (!dealId) return;
    try {
      await downloadAndOpenWatermarkedPdf(dealId, fileId, originalName);
    } catch (err: any) {
      Alert.alert('Stream Failed', err?.message || 'Unable to stream watermarked PDF.');
    }
  };

  // Graph nodes & edges (use report.cross_references when present)
  const graphNodes: Omit<GraphNode, 'x' | 'y' | 'radius'>[] = findings.slice(0, 30).map((f) => ({
    id: f.id,
    title: f.title,
    domain: f.domain,
    severity: f.severity,
  }));

  const graphEdges: GraphEdge[] = [];
  if (Array.isArray(report?.cross_references) && report.cross_references.length > 0) {
    const idSet = new Set(graphNodes.map((n) => n.id));
    report.cross_references.forEach((cr: any) => {
      if (cr.source_finding_id && cr.target_finding_id && idSet.has(cr.source_finding_id) && idSet.has(cr.target_finding_id)) {
        graphEdges.push({
          source: cr.source_finding_id,
          target: cr.target_finding_id,
          relationship: cr.relationship || 'dependency',
        });
      }
    });
  }
  if (graphEdges.length === 0) {
    for (let i = 0; i < graphNodes.length - 1; i++) {
      if (i % 2 === 0) {
        graphEdges.push({
          source: graphNodes[i].id,
          target: graphNodes[i + 1].id,
          relationship: 'cross-domain dependency',
        });
      }
    }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'verdict': {
        const decision = report?.verdict?.go_no_go || deal?.goNoGo || 'CAUTION';
        const execSummary =
          report?.verdict?.executive_summary ||
          deal?.executiveSummaryMd ||
          'Upload VDR documents and deploy the 13 forensic agents to generate a cited Investment Committee verdict.';
        const riskScore = report?.verdict?.overall_risk_score ?? deal?.overallRiskScore ?? 0;

        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            <GlowCard decision={decision}>
              <Text style={styles.verdictDecisionTitle}>
                {decision === 'GO'
                  ? 'RECOMMENDATION: PROCEED (GO)'
                  : decision === 'NO-GO'
                  ? 'RECOMMENDATION: TERMINATE (NO-GO)'
                  : 'RECOMMENDATION: PROCEED WITH CONDITIONS (CAUTION)'}
              </Text>
              <Text style={styles.verdictSub}>
                Overall Risk Score: {Number(riskScore).toFixed(1)} / 10 {'\u2022'}{' '}
                {findings.length || deal?.totalFindings || 0} Flagged Findings
              </Text>
            </GlowCard>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>EXECUTIVE SUMMARY</Text>
              <Text style={styles.markdownText}>{execSummary}</Text>
            </View>

            {Array.isArray(report?.verdict?.deal_breakers) && report.verdict.deal_breakers.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={[styles.sectionTitle, { color: '#FB7185' }]}>POTENTIAL DEAL BREAKERS</Text>
                {report.verdict.deal_breakers.map((db: string, i: number) => (
                  <Text key={i} style={styles.bulletText}>
                    {'\u2022'} {db}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>CRITICAL P0 & P1 DEAL ISSUES</Text>
              {findings.filter((f) => f.severity === 'P0' || f.severity === 'P1').length === 0 ? (
                <Text style={styles.mutedText}>No P0/P1 findings synced yet.</Text>
              ) : (
                findings
                  .filter((f) => f.severity === 'P0' || f.severity === 'P1')
                  .slice(0, 6)
                  .map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={styles.dealRiskRow}
                      onPress={() => {
                        setActionFindingTarget(f);
                        setActionModalOpen(true);
                      }}
                    >
                      <SeverityBadge severity={f.severity} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.dealRiskTitle}>{f.title}</Text>
                        <Text style={styles.dealRiskDesc} numberOfLines={2}>
                          {f.description}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
              )}
            </View>
          </ScrollView>
        );
      }

      case 'findings':
        return (
          <View style={{ flex: 1 }}>
            <View style={styles.searchBar}>
              <Search size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="FTS5 sub-millisecond search (EBITDA, IP, indemnity)..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <View style={styles.filterScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.filterChip, !domainFilter && styles.filterChipActive]}
                  onPress={() => setDomainFilter(null)}
                >
                  <Text style={[styles.filterChipText, !domainFilter && styles.filterChipTextActive]}>
                    All Domains
                  </Text>
                </TouchableOpacity>
                {DOMAINS.map((dom) => (
                  <TouchableOpacity
                    key={dom}
                    style={[styles.filterChip, domainFilter === dom && styles.filterChipActive]}
                    onPress={() => setDomainFilter(domainFilter === dom ? null : dom)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        domainFilter === dom && styles.filterChipTextActive,
                      ]}
                    >
                      {dom.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.severityToggleRow}>
              {(['ALL', 'P0', 'P1', 'P2', 'P3'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.severityBtn,
                    (s === 'ALL' ? !severityFilter : severityFilter === s) &&
                      styles.severityBtnActive,
                  ]}
                  onPress={() => setSeverityFilter(s === 'ALL' ? null : (s as Severity))}
                >
                  <Text
                    style={[
                      styles.severityBtnText,
                      (s === 'ALL' ? !severityFilter : severityFilter === s) &&
                        styles.severityBtnTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <ActivityIndicator color="#06B6D4" style={{ marginTop: 20 }} />
            ) : (
              <FlashList
                data={findings}
                keyExtractor={(item) => item.id}
                estimatedItemSize={150}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.findingCard}
                    onPress={() => {
                      setActionFindingTarget(item);
                      setActionModalOpen(true);
                    }}
                  >
                    <View style={styles.findingCardTop}>
                      <SeverityBadge severity={item.severity} />
                      <View style={styles.domainBadge}>
                        <Text style={styles.domainBadgeText}>{item.domain.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.findingCardTitle}>{item.title}</Text>
                    <Text style={styles.findingCardDesc}>{item.description}</Text>

                    {item.citations && item.citations.length > 0 && (
                      <View style={styles.citationsRow}>
                        {item.citations.map((c, i) => (
                          <TouchableOpacity
                            key={i}
                            style={styles.citationBadge}
                            onPress={() => setCitationsOpen(true, c)}
                          >
                            <FileText size={11} color="#06B6D4" style={{ marginRight: 4 }} />
                            <Text style={styles.citationBadgeText} numberOfLines={1}>
                              {c.file} (p.{c.page || '1'})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        );

      case 'heatmap':
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            <Text style={styles.heatmapHeader}>9-DOMAIN DILIGENCE RISK BREAKDOWN</Text>
            {DOMAINS.map((dom) => {
              const domFindings = findings.filter((f) => f.domain === dom);
              const p0Count = domFindings.filter((f) => f.severity === 'P0').length;
              const p1Count = domFindings.filter((f) => f.severity === 'P1').length;
              const domReportScore = report?.verdict?.domain_risk_scores?.[dom];
              const score =
                typeof domReportScore === 'number'
                  ? domReportScore.toFixed(1)
                  : Math.min(10, p0Count * 3.5 + p1Count * 1.8 + domFindings.length * 0.4).toFixed(1);

              return (
                <View key={dom} style={styles.heatmapCard}>
                  <View style={styles.heatmapRow}>
                    <Text style={styles.heatmapDomain}>{dom.toUpperCase()}</Text>
                    <Text style={styles.heatmapScore}>{score} / 10 Risk</Text>
                  </View>
                  <View style={styles.heatmapBarTrack}>
                    <View
                      style={[
                        styles.heatmapBarFill,
                        {
                          width: `${Math.min(parseFloat(score) * 10, 100)}%`,
                          backgroundColor:
                            parseFloat(score) >= 7
                              ? '#F43F5E'
                              : parseFloat(score) >= 4
                              ? '#F59E0B'
                              : '#10B981',
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.heatmapStats}>
                    <Text style={styles.heatmapCountText}>{domFindings.length} Total Findings</Text>
                    <Text style={styles.heatmapCountP0}>
                      {p0Count} P0 Critical {'\u2022'} {p1Count} P1 High
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        );

      case 'graph':
        return (
          <View style={{ flex: 1, alignItems: 'center', paddingTop: 8 }}>
            <Text style={styles.graphHeader}>
              Cross-Domain Risk Graph ({graphNodes.length} Nodes, {graphEdges.length} Links)
            </Text>
            <SkiaForceGraph
              width={SCREEN_WIDTH - 32}
              height={430}
              nodes={graphNodes}
              edges={graphEdges}
              onSelectNode={(node) => {
                const match = findings.find((f) => f.id === node.id);
                if (match) {
                  setActionFindingTarget(match);
                  setActionModalOpen(true);
                } else {
                  Alert.alert('Selected Finding', `[${node.severity}] ${node.title}`);
                }
              }}
            />
          </View>
        );

      case 'analyst_q': {
        const qList = qDomain === 'all' ? questions : questionsByDomain[qDomain] || [];
        return (
          <View style={{ flex: 1 }}>
            <View style={{ marginBottom: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.filterChip, qDomain === 'all' && styles.filterChipActive]}
                  onPress={() => setQDomain('all')}
                >
                  <Text style={[styles.filterChipText, qDomain === 'all' && styles.filterChipTextActive]}>
                    All ({questions.length})
                  </Text>
                </TouchableOpacity>
                {Object.keys(questionsByDomain).map((dom) => (
                  <TouchableOpacity
                    key={dom}
                    style={[styles.filterChip, qDomain === dom && styles.filterChipActive]}
                    onPress={() => setQDomain(dom)}
                  >
                    <Text style={[styles.filterChipText, qDomain === dom && styles.filterChipTextActive]}>
                      {dom.toUpperCase()} ({questionsByDomain[dom]?.length || 0})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {questionsLoading ? (
              <View style={styles.centeredBox}>
                <ActivityIndicator color="#06B6D4" />
                <Text style={styles.mutedText}>Synthesizing Management Interrogation Vectors...</Text>
              </View>
            ) : qList.length === 0 ? (
              <View style={styles.centeredBox}>
                <Text style={styles.mutedText}>
                  {pythonJobId
                    ? 'No management questions generated for this job yet.'
                    : 'Run AI analysis on VDR files to generate target management Q&A.'}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {qList.map((item, idx) => {
                  const isExp = !!expandedQ[idx];
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.questionCard}
                      onPress={() => setExpandedQ((p) => ({ ...p, [idx]: !p[idx] }))}
                    >
                      <View style={styles.qTopRow}>
                        <SeverityBadge severity={item.severity || 'P2'} />
                        <View style={styles.domainBadge}>
                          <Text style={styles.domainBadgeText}>
                            {String(item.domain || 'general').toUpperCase()}
                          </Text>
                        </View>
                        {isExp ? (
                          <ChevronUp size={16} color="#94A3B8" />
                        ) : (
                          <ChevronDown size={16} color="#94A3B8" />
                        )}
                      </View>
                      <Text style={styles.questionText}>{item.question}</Text>
                      {isExp && (
                        <View style={styles.qExpandedBox}>
                          {item.rationale && (
                            <Text style={styles.qSubBlock}>
                              <Text style={styles.qSubLabel}>RATIONALE: </Text>
                              {item.rationale}
                            </Text>
                          )}
                          {item.what_to_look_for && (
                            <Text style={styles.qSubBlock}>
                              <Text style={[styles.qSubLabel, { color: '#34D399' }]}>
                                TARGET SIGNAL:{' '}
                              </Text>
                              {item.what_to_look_for}
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        );
      }

      case 'actions':
        return (
          <View style={{ flex: 1 }}>
            <View style={styles.dealActionToolbar}>
              <TouchableOpacity
                style={styles.toolbarPrimaryBtn}
                onPress={() => setUploadModalOpen(true)}
              >
                <UploadCloud size={14} color="#FFFFFF" />
                <Text style={styles.toolbarBtnText}>Upload Docs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.toolbarSecondaryBtn}
                onPress={handleSyncFindings}
                disabled={syncingFindings}
              >
                {syncingFindings ? (
                  <ActivityIndicator size="small" color="#06B6D4" />
                ) : (
                  <>
                    <RefreshCw size={14} color="#06B6D4" />
                    <Text style={styles.toolbarSecText}>Sync Findings</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <FlashList
              data={findings}
              keyExtractor={(item) => item.id}
              estimatedItemSize={120}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.findingCard}
                  onPress={() => {
                    setActionFindingTarget(item);
                    setActionModalOpen(true);
                  }}
                >
                  <View style={styles.findingCardTop}>
                    <SeverityBadge severity={item.severity} />
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <View style={styles.domainBadge}>
                        <Text style={styles.domainBadgeText}>
                          {item.workflowState.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.domainBadge}>
                        <Text style={styles.domainBadgeText}>
                          {item.reviewStatus.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.findingCardTitle}>{item.title}</Text>
                  <View style={styles.actionCardFoot}>
                    <Text style={styles.mutedText}>
                      {item.assignedTo ? `Assigned: ${item.assignedTo}` : 'Unassigned'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Sliders size={12} color="#06B6D4" />
                      <Text style={{ color: '#67E8F9', fontSize: 11, fontWeight: '700' }}>
                        Assign / Review
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        );

      case 'compare': {
        const dealFiles = deal?.files || [];
        const filteredChanges = (compareResult?.changes || []).filter(
          (c) => compareFilter === 'all' || c.type === compareFilter
        );
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>SEMANTIC DOCUMENT COMPARATOR</Text>
              <Text style={styles.cmpLabel}>DOCUMENT A (BASELINE REFERENCE)</Text>
              {dealFiles.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {dealFiles.map((f) => (
                    <TouchableOpacity
                      key={`a_${f.savedName}`}
                      style={[styles.filterChip, fileA === f.savedName && styles.filterChipActive]}
                      onPress={() => setFileA(f.savedName)}
                    >
                      <Text style={styles.filterChipText}>{f.originalName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TextInput
                style={styles.cmpInput}
                value={fileA}
                onChangeText={setFileA}
                placeholder="Baseline filename in VDR..."
                placeholderTextColor="#64748B"
              />
              <TextInput
                style={styles.cmpInput}
                value={nameA}
                onChangeText={setNameA}
                placeholder="Label (e.g. Audited 2024)"
                placeholderTextColor="#64748B"
              />

              <Text style={[styles.cmpLabel, { marginTop: 10 }]}>DOCUMENT B (REVISED TARGET)</Text>
              {dealFiles.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {dealFiles.map((f) => (
                    <TouchableOpacity
                      key={`b_${f.savedName}`}
                      style={[styles.filterChip, fileB === f.savedName && styles.filterChipActive]}
                      onPress={() => setFileB(f.savedName)}
                    >
                      <Text style={styles.filterChipText}>{f.originalName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TextInput
                style={styles.cmpInput}
                value={fileB}
                onChangeText={setFileB}
                placeholder="Comparison filename in VDR..."
                placeholderTextColor="#64748B"
              />
              <TextInput
                style={styles.cmpInput}
                value={nameB}
                onChangeText={setNameB}
                placeholder="Label (e.g. Updated Q1 Draft)"
                placeholderTextColor="#64748B"
              />

              <TouchableOpacity
                style={[styles.toolbarPrimaryBtn, { marginTop: 12, paddingVertical: 12 }]}
                onPress={handleRunComparison}
                disabled={comparing}
              >
                {comparing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <ArrowLeftRight size={15} color="#FFFFFF" />
                    <Text style={styles.toolbarBtnText}>Run Semantic Diff</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {compareResult && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  TRAJECTORY: {compareResult.risk_direction?.toUpperCase()}
                </Text>
                {compareResult.summary && (
                  <Text style={[styles.markdownText, { marginBottom: 10 }]}>
                    {compareResult.summary}
                  </Text>
                )}
                <View style={styles.severityToggleRow}>
                  {(['all', 'changed', 'new', 'removed'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.severityBtn, compareFilter === t && styles.severityBtnActive]}
                      onPress={() => setCompareFilter(t)}
                    >
                      <Text style={styles.severityBtnText}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {filteredChanges.map((c, idx) => (
                  <View key={idx} style={styles.changeBox}>
                    <Text style={styles.changeHead}>
                      [{c.type.toUpperCase()} • {c.severity.toUpperCase()}] {c.item}
                    </Text>
                    {c.detail_a ? <Text style={styles.changeSub}>Baseline: {c.detail_a}</Text> : null}
                    {c.detail_b ? <Text style={styles.changeSub}>Revised: {c.detail_b}</Text> : null}
                    {c.business_impact ? (
                      <Text style={styles.changeImpact}>Impact: {c.business_impact}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        );
      }

      case 'agents':
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                PIPELINE STATUS: {(job?.status || deal?.status || 'draft').toUpperCase()}
              </Text>
              <TouchableOpacity
                style={[styles.toolbarPrimaryBtn, { paddingVertical: 11 }]}
                onPress={handleReRunAnalysis}
                disabled={rerunningJob}
              >
                {rerunningJob ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Rocket size={15} color="#FFFFFF" />
                    <Text style={styles.toolbarBtnText}>Deploy / Re-Run 13 AI Agents</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {DOMAINS.map((dom) => {
              const p = job?.agentProgress?.[dom];
              const pct = p?.pct ?? (job?.status === 'done' || report ? 100 : 0);
              const status = p?.status || (job?.status === 'done' || report ? 'done' : 'idle');
              const count = p?.findingsCount ?? p?.findings_count ?? findings.filter((f) => f.domain === dom).length;

              return (
                <View key={dom} style={styles.heatmapCard}>
                  <View style={styles.heatmapRow}>
                    <Text style={styles.heatmapDomain}>{dom.toUpperCase()} AGENT</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      {status === 'done' ? (
                        <CheckCircle2 size={13} color="#10B981" />
                      ) : (
                        <Clock size={13} color="#64748B" />
                      )}
                      <Text style={styles.heatmapCountText}>{status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.heatmapBarTrack}>
                    <View
                      style={[
                        styles.heatmapBarFill,
                        { width: `${pct}%`, backgroundColor: '#06B6D4' },
                      ]}
                    />
                  </View>
                  <Text style={styles.heatmapCountText}>
                    {pct}% complete {'\u2022'} {count} findings
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        );

      case 'vdr': {
        const filesList = deal?.files || [];
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            <View style={styles.dealActionToolbar}>
              <TouchableOpacity
                style={styles.toolbarPrimaryBtn}
                onPress={() => setUploadModalOpen(true)}
              >
                <UploadCloud size={15} color="#FFFFFF" />
                <Text style={styles.toolbarBtnText}>Upload VDR Documents</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.toolbarSecondaryBtn}
                onPress={handleReRunAnalysis}
                disabled={rerunningJob}
              >
                <Rocket size={15} color="#06B6D4" />
                <Text style={styles.toolbarSecText}>Run AI</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.vdrHeader}>
              VDR REPOSITORY ({filesList.length} FILE{filesList.length === 1 ? '' : 'S'})
            </Text>

            {filesList.length === 0 ? (
              <View style={styles.sectionCard}>
                <Text style={styles.mutedText}>
                  No VDR documents attached yet. Tap "Upload VDR Documents" above to ingest PDFs, DOCX, or XLSX files.
                </Text>
              </View>
            ) : (
              filesList.map((file, idx) => (
                <View key={file._id || file.savedName || idx} style={styles.vdrCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <FileText size={18} color="#06B6D4" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vdrFileName} numberOfLines={1}>
                        {file.originalName || file.savedName}
                      </Text>
                      <Text style={styles.vdrFileSize}>
                        {file.size ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'VDR'} {'\u2022'} Watermark Protected
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.inspectBtn}
                    onPress={() =>
                      handleDownloadWatermarked(
                        file._id || file.savedName,
                        file.originalName || file.savedName
                      )
                    }
                  >
                    <Text style={styles.inspectBtnText}>Inspect</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        );
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.dealName} numberOfLines={1}>
              {deal?.name || 'Deal Dossier'}
            </Text>
            <Text style={styles.dealTarget} numberOfLines={1}>
              {deal?.targetCompany || 'Target Entity'}
              {deal?.acquirer ? ` → ${deal.acquirer}` : ''}
            </Text>
          </View>
          {reportIntegrity && (
            <View
              style={[
                styles.sealBadge,
                reportIntegrity === 'verified' ? styles.sealVerified : styles.sealTampered,
              ]}
            >
              {reportIntegrity === 'verified' ? (
                <ShieldCheck size={13} color="#10B981" />
              ) : (
                <ShieldAlert size={13} color="#F43F5E" />
              )}
              <Text
                style={[
                  styles.sealText,
                  { color: reportIntegrity === 'verified' ? '#34D399' : '#FB7185' },
                ]}
              >
                {reportIntegrity === 'verified' ? 'SHA-256' : 'TAMPERED'}
              </Text>
            </View>
          )}
        </View>

        {/* Tab Navigation Switcher (9 Web Tabs) */}
        <View style={styles.tabSwitcher}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {DOSSIER_TABS.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabItem, activeTab === t.id && styles.tabItemActive]}
                onPress={() => setActiveTab(t.id)}
              >
                <Text style={[styles.tabItemText, activeTab === t.id && styles.tabItemTextActive]}>
                  {t.id === 'findings' ? `Findings (${findings.length})` : t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.content}>{renderTabContent()}</View>

        <TouchableOpacity style={styles.fabCopilot} onPress={() => setCopilotOpen(true)}>
          <Bot size={22} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.fabCopilotText}>Pocket Copilot</Text>
        </TouchableOpacity>

        <CitationsBottomSheet />
        {dealId && <PocketCopilotDrawer dealId={dealId} />}

        <FindingActionModal
          visible={actionModalOpen}
          finding={actionFindingTarget}
          onClose={() => setActionModalOpen(false)}
          onUpdated={loadRemoteDealData}
        />

        <VdrUploadModal
          visible={uploadModalOpen}
          initialDealId={dealId}
          onClose={() => setUploadModalOpen(false)}
          onUploaded={() => loadRemoteDealData()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0E131F',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dealName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dealTarget: {
    fontSize: 12,
    color: '#94A3B8',
  },
  sealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
  },
  sealVerified: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.35)',
  },
  sealTampered: {
    backgroundColor: 'rgba(244,63,94,0.12)',
    borderColor: 'rgba(244,63,94,0.35)',
  },
  sealText: {
    fontSize: 9,
    fontWeight: '800',
  },
  tabSwitcher: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 8,
    marginBottom: 12,
  },
  tabItem: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  tabItemActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#06B6D4',
  },
  content: {
    flex: 1,
  },
  tabScroll: {
    flex: 1,
  },
  verdictDecisionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F1F5F9',
  },
  verdictSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#0E131F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 15,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  markdownText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#CBD5E1',
  },
  bulletText: {
    fontSize: 12,
    lineHeight: 19,
    color: '#FCA5A5',
    marginBottom: 4,
  },
  mutedText: {
    fontSize: 12,
    color: '#64748B',
  },
  dealRiskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  dealRiskTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  dealRiskDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E131F',
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 8,
    fontSize: 12,
  },
  filterScrollWrapper: {
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: '#1E3A8A',
  },
  filterChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#93C5FD',
  },
  severityToggleRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  severityBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginRight: 6,
  },
  severityBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    borderWidth: 1,
    borderColor: '#06B6D4',
  },
  severityBtnText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  severityBtnTextActive: {
    color: '#06B6D4',
  },
  findingCard: {
    backgroundColor: '#0E131F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    marginBottom: 10,
  },
  findingCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  domainBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  domainBadgeText: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
  },
  findingCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  findingCardDesc: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
    marginBottom: 8,
  },
  citationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  citationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  citationBadgeText: {
    fontSize: 10,
    color: '#67E8F9',
  },
  heatmapHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  heatmapCard: {
    backgroundColor: '#0E131F',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 8,
  },
  heatmapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heatmapDomain: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  heatmapScore: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F59E0B',
  },
  heatmapBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    marginVertical: 8,
    overflow: 'hidden',
  },
  heatmapBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  heatmapStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heatmapCountText: {
    fontSize: 10,
    color: '#64748B',
  },
  heatmapCountP0: {
    fontSize: 10,
    color: '#F43F5E',
    fontWeight: '600',
  },
  graphHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  centeredBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  questionCard: {
    backgroundColor: '#0E131F',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  qTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  questionText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  qExpandedBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  qSubBlock: {
    fontSize: 11,
    color: '#CBD5E1',
    lineHeight: 17,
  },
  qSubLabel: {
    fontWeight: '800',
    color: '#06B6D4',
  },
  dealActionToolbar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  toolbarPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0891B2',
    borderRadius: 8,
    paddingVertical: 9,
    gap: 6,
  },
  toolbarBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  toolbarSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,182,212,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.35)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 6,
  },
  toolbarSecText: {
    color: '#67E8F9',
    fontSize: 12,
    fontWeight: '700',
  },
  actionCardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  cmpLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  cmpInput: {
    backgroundColor: '#182032',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#FFFFFF',
    fontSize: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  changeBox: {
    backgroundColor: '#182032',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  changeHead: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  changeSub: {
    fontSize: 11,
    color: '#CBD5E1',
    marginBottom: 2,
  },
  changeImpact: {
    fontSize: 11,
    color: '#67E8F9',
    marginTop: 3,
  },
  vdrHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  vdrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0E131F',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  vdrFileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  vdrFileSize: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  inspectBtn: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  inspectBtnText: {
    color: '#06B6D4',
    fontSize: 11,
    fontWeight: '700',
  },
  fabCopilot: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0891B2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#06B6D4',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabCopilotText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
