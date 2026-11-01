import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bot,
  Search,
  FileText,
  Shield,
  Layers,
  Activity,
  HelpCircle,
  FolderOpen,
  Filter,
} from 'lucide-react-native';
import { SeverityBadge } from '../../src/components/ui/SeverityBadge';
import { GlowCard } from '../../src/components/ui/GlowCard';
import { SkiaForceGraph, GraphNode, GraphEdge } from '../../src/components/graph/SkiaForceGraph';
import { CitationsBottomSheet } from '../../src/components/citations/CitationsBottomSheet';
import { PocketCopilotDrawer } from '../../src/components/copilot/PocketCopilotDrawer';
import { useDealStore, DealDossierTab } from '../../src/stores/useDealStore';
import { getEncryptedDb, searchFindingsFTS5 } from '../../src/db/client';
import { syncDealDeltaFromServer } from '../../src/db/outboxWorker';
import { Finding, DiligenceDomain, Severity } from '../../src/types';

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

export default function DealDossierScreen() {
  const router = useRouter();
  const { id: dealId } = useLocalSearchParams<{ id: string }>();
  const {
    selectedDeal,
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

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFindings();
    if (dealId) {
      syncDealDeltaFromServer(dealId).then(() => loadFindings()).catch(() => {});
    }
  }, [dealId, searchQuery, domainFilter, severityFilter]);

  const loadFindings = () => {
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
      console.warn('Error querying SQLite FTS5 findings:', e);
    } finally {
      setLoading(false);
    }
  };

  // Convert findings to graph nodes & edges
  const graphNodes: Omit<GraphNode, 'x' | 'y' | 'radius'>[] = findings.slice(0, 25).map((f) => ({
    id: f.id,
    title: f.title,
    domain: f.domain,
    severity: f.severity,
  }));

  const graphEdges: GraphEdge[] = [];
  for (let i = 0; i < graphNodes.length - 1; i++) {
    if (i % 2 === 0) {
      graphEdges.push({
        source: graphNodes[i].id,
        target: graphNodes[i + 1].id,
        relationship: 'cross-domain dependency',
      });
    }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'verdict':
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            {/* Go / No-Go Glow Banner */}
            <GlowCard decision={selectedDeal?.goNoGo || 'CAUTION'}>
              <View style={styles.verdictBannerRow}>
                <View>
                  <Text style={styles.verdictDecisionTitle}>
                    {selectedDeal?.goNoGo === 'GO'
                      ? 'RECOMMENDATION: PROCEED (GO)'
                      : selectedDeal?.goNoGo === 'NO-GO'
                      ? 'RECOMMENDATION: TERMINATE (NO-GO)'
                      : 'RECOMMENDATION: PROCEED WITH CONDITIONS (CAUTION)'}
                  </Text>
                  <Text style={styles.verdictSub}>
                    Overall Risk Score: {selectedDeal?.overallRiskScore || 7.4} / 10 \u2022{' '}
                    {findings.length} Flagged Findings
                  </Text>
                </View>
              </View>
            </GlowCard>

            {/* Executive Summary Markdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>EXECUTIVE SUMMARY</Text>
              <Text style={styles.markdownText}>
                {selectedDeal?.executiveSummaryMd ||
                  'The Target displays robust top-line momentum with $42M ARR (+48% YoY). However, critical diligence issues in IP licensing (AGPL copyleft contamination) and state sales tax nexus non-compliance represent quantifiable liabilities totaling $8.5M. We advise securing an escrow carve-out of $9.0M.'}
              </Text>
            </View>

            {/* Key Critical Deal Risks */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>CRITICAL P0 & P1 DEAL ISSUES</Text>
              {findings
                .filter((f) => f.severity === 'P0' || f.severity === 'P1')
                .slice(0, 4)
                .map((f) => (
                  <View key={f.id} style={styles.dealRiskRow}>
                    <SeverityBadge severity={f.severity} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.dealRiskTitle}>{f.title}</Text>
                      <Text style={styles.dealRiskDesc} numberOfLines={2}>
                        {f.description}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
          </ScrollView>
        );

      case 'findings':
        return (
          <View style={{ flex: 1 }}>
            {/* FTS5 BM25 Search Bar */}
            <View style={styles.searchBar}>
              <Search size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="FTS5 sub-millisecond search (e.g. EBITDA, license)..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Domain & Severity Filters */}
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

            {/* Severity Pill Toggles */}
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

            {/* Findings List */}
            {loading ? (
              <ActivityIndicator color="#06B6D4" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={findings}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={styles.findingCard}>
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
                  </View>
                )}
              </FlatList>
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
              const score = (domFindings.length * 1.8).toFixed(1);

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
                            parseFloat(score) > 7
                              ? '#F43F5E'
                              : parseFloat(score) > 4
                              ? '#F59E0B'
                              : '#10B981',
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.heatmapStats}>
                    <Text style={styles.heatmapCountText}>{domFindings.length} Total Findings</Text>
                    <Text style={styles.heatmapCountP0}>
                      {p0Count} P0 Critical \u2022 {p1Count} P1 High
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
              Focal-Point Matrix Force Graph ({graphNodes.length} Nodes)
            </Text>
            <SkiaForceGraph
              width={SCREEN_WIDTH - 32}
              height={440}
              nodes={graphNodes}
              edges={graphEdges}
              onSelectNode={(node) => {
                alert(`Selected Finding:\n[${node.severity}] ${node.title}`);
              }}
            />
          </View>
        );

      case 'analyst_q':
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            <Text style={styles.analystQHeader}>MANAGEMENT DILIGENCE QUESTIONS</Text>
            {[
              {
                category: 'IP & Open Source',
                q: 'Provide the complete dependency audit confirming isolation of the AGPL-3.0 marked-core package from the proprietary SaaS platform.',
              },
              {
                category: 'Quality of Earnings',
                q: 'Reconcile the $1.4M software capitalization policy with peer GAAP benchmarks for maintenance engineering.',
              },
              {
                category: 'Tax & Multi-State Nexus',
                q: 'What is the estimated statutory interest exposure across the 14 unfiled Wayfair economic nexus states?',
              },
              {
                category: 'Cybersecurity KMS',
                q: 'Confirm timeline to implement envelope encryption and customer-managed AWS KMS keys across production databases.',
              },
            ].map((item, idx) => (
              <View key={idx} style={styles.questionCard}>
                <View style={styles.questionCategoryPill}>
                  <Text style={styles.questionCategoryText}>{item.category}</Text>
                </View>
                <Text style={styles.questionText}>{item.q}</Text>
              </View>
            ))}
          </ScrollView>
        );

      case 'vdr':
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.tabScroll}>
            <Text style={styles.vdrHeader}>CONFIDENTIAL VDR REPOSITORY</Text>
            {[
              'IP_Audit_Report.pdf',
              'QoE_Analysis_v3.pdf',
              'SOC2_Type_II_2025.pdf',
              'State_Tax_Nexus_Review.pdf',
              'Customer_Contracts_Schedule.pdf',
            ].map((file, idx) => (
              <View key={idx} style={styles.vdrCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <FileText size={18} color="#06B6D4" style={{ marginRight: 10 }} />
                  <View>
                    <Text style={styles.vdrFileName}>{file}</Text>
                    <Text style={styles.vdrFileSize}>2.4 MB \u2022 Forensic Watermark Protected</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.inspectBtn}
                  onPress={() =>
                    setCitationsOpen(true, {
                      file,
                      page: 1,
                      section: 'Executive Diligence',
                      quote: 'Confidential source document loaded under zero-trust watermark.',
                    })
                  }
                >
                  <Text style={styles.inspectBtnText}>Inspect</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        );
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
              {selectedDeal?.name || 'Deal Dossier'}
            </Text>
            <Text style={styles.dealTarget}>
              {selectedDeal?.targetCompany || 'Target Entity'}
            </Text>
          </View>
        </View>

        {/* Tab Navigation Switcher */}
        <View style={styles.tabSwitcher}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(
              [
                { id: 'verdict', label: 'Verdict' },
                { id: 'findings', label: `Findings (${findings.length})` },
                { id: 'heatmap', label: 'Heatmap' },
                { id: 'graph', label: 'Force Graph' },
                { id: 'analyst_q', label: 'Analyst Q&A' },
                { id: 'vdr', label: 'VDR Docs' },
              ] as const
            ).map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabItem, activeTab === t.id && styles.tabItemActive]}
                onPress={() => setActiveTab(t.id as DealDossierTab)}
              >
                <Text
                  style={[styles.tabItemText, activeTab === t.id && styles.tabItemTextActive]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab Content */}
        <View style={styles.content}>{renderTabContent()}</View>

        {/* Floating Copilot Action Button */}
        <TouchableOpacity style={styles.fabCopilot} onPress={() => setCopilotOpen(true)}>
          <Bot size={22} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.fabCopilotText}>Pocket Copilot</Text>
        </TouchableOpacity>

        {/* Bottom Sheet Modals */}
        <CitationsBottomSheet />
        {dealId && <PocketCopilotDrawer dealId={dealId} />}
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
    marginBottom: 12,
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
  tabSwitcher: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 8,
    marginBottom: 12,
  },
  tabItem: {
    paddingHorizontal: 12,
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
    fontSize: 13,
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
  verdictBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    padding: 16,
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
  analystQHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  questionCard: {
    backgroundColor: '#0E131F',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  questionCategoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  questionCategoryText: {
    fontSize: 10,
    color: '#60A5FA',
    fontWeight: '700',
  },
  questionText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#E2E8F0',
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
