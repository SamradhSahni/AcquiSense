import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, ShieldAlert, ArrowUpRight, TrendingUp, Filter } from 'lucide-react-native';
import { GlowCard } from '../../src/components/ui/GlowCard';
import { useDealStore } from '../../src/stores/useDealStore';
import { apiClient } from '../../src/services/api';
import { getEncryptedDb } from '../../src/db/client';
import { Deal } from '../../src/types';

export default function DealPipelineScreen() {
  const router = useRouter();
  const { setSelectedDeal } = useDealStore();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLocalDeals();
    fetchRemoteDeals();
  }, []);

  const loadLocalDeals = () => {
    try {
      const { sqlite } = getEncryptedDb();
      const rows = sqlite.getAllSync<any>(`SELECT * FROM deals ORDER BY updated_at DESC`);
      if (rows && rows.length > 0) {
        setDeals(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            targetCompany: r.target_company,
            acquirer: r.acquirer,
            modelProfile: r.model_profile,
            status: r.status,
            goNoGo: r.go_no_go,
            overallRiskScore: r.overall_risk_score,
            totalFindings: r.total_findings,
            executiveSummaryMd: r.executive_summary_md,
            latestJobId: r.latest_job_id,
            syncCursor: r.sync_cursor,
            updatedAt: r.updated_at,
          }))
        );
      }
    } catch (e) {
      console.warn('Error reading local deals:', e);
    }
  };

  const fetchRemoteDeals = async () => {
    try {
      const { data } = await apiClient.get('/api/deals');
      if (Array.isArray(data)) {
        const { sqlite } = getEncryptedDb();
        sqlite.withTransactionSync(() => {
          for (const d of data) {
            sqlite.runSync(
              `INSERT INTO deals (
                id, name, target_company, acquirer, model_profile, status,
                go_no_go, overall_risk_score, total_findings, latest_job_id, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                go_no_go = excluded.go_no_go,
                overall_risk_score = excluded.overall_risk_score,
                total_findings = excluded.total_findings,
                latest_job_id = excluded.latest_job_id,
                updated_at = excluded.updated_at`,
              [
                d._id || d.id,
                d.name,
                d.targetCompany || '',
                d.acquirer || '',
                d.modelProfile || 'standard',
                d.status || 'draft',
                d.goNoGo || null,
                d.overallRiskScore || 0,
                d.totalFindings || 0,
                d.latestJobId || null,
                d.updatedAt || new Date().toISOString(),
              ]
            );
          }
        });
        loadLocalDeals();
      }
    } catch (e) {
      console.warn('Remote deals fetch error (offline mode active):', e);
      // Seed default deal if completely empty
      const { sqlite } = getEncryptedDb();
      const count = sqlite.getFirstSync<{ c: number }>(`SELECT COUNT(*) as c FROM deals`);
      if (!count || count.c === 0) {
        seedSampleDeal();
        loadLocalDeals();
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const seedSampleDeal = () => {
    const { sqlite } = getEncryptedDb();
    const dealId = 'deal_enterprise_cloud_2026';
    const now = new Date().toISOString();
    sqlite.runSync(
      `INSERT OR REPLACE INTO deals (
        id, name, target_company, acquirer, model_profile, status,
        go_no_go, overall_risk_score, total_findings, executive_summary_md, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        'Project Titan — CloudScale Acquisition',
        'CloudScale Systems Inc.',
        'Global Horizon PE',
        'premium',
        'done',
        'CAUTION',
        7.4,
        28,
        '# Executive Due Diligence Verdict\n\nOverall target profile demonstrates robust 48% YoY ARR growth, but critical liabilities in open-source copyleft licenses and $3.2M unrecorded sales tax obligations warrant an escrow adjustment of $8.5M.',
        now,
      ]
    );

    // Seed 4 sample findings
    const findingsList = [
      {
        id: 'find_01',
        domain: 'legal',
        severity: 'P0',
        title: 'AGPL-3.0 Copyleft Contamination in Proprietary Kernel',
        description: 'Target core dispatch microservice embeds an AGPL-3.0 dependency without dynamic linkage isolation.',
        evidence: 'GitHub dependency manifest line 48: "marked-core: agpl-v3"',
        citations: [{ file: 'IP_Audit_Report.pdf', page: 12, quote: 'Potential copyleft contamination requiring complete rewrite.' }],
        tags: ['IP', 'OpenSource', 'Kernel'],
        workflowState: 'open',
        reviewStatus: 'ai_generated',
      },
      {
        id: 'find_02',
        domain: 'finance',
        severity: 'P1',
        title: 'QoE EBITDA Discrepancy: Recurring Software Capitalization',
        description: '$1.4M of standard maintenance engineering expenses were capitalized onto the balance sheet as R&D.',
        evidence: 'Q3 Financial Statements, Schedule B - Capitalized Software Assets',
        citations: [{ file: 'QoE_Analysis_v3.pdf', page: 24, quote: 'Capitalization policy is overly aggressive compared to peer benchmark.' }],
        tags: ['EBITDA', 'QoE', 'Accounting'],
        workflowState: 'assigned',
        reviewStatus: 'confirmed',
      },
      {
        id: 'find_03',
        domain: 'cyber',
        severity: 'P1',
        title: 'SOC2 Type II Audit Exception: Production DB Decoupled KMS',
        description: 'Customer PII database in AWS us-east-1 lacks envelope encryption via customer-managed AWS KMS keys.',
        evidence: 'SOC2 Type II Report page 37, Section IV Control Gap',
        citations: [{ file: 'SOC2_Type_II_2025.pdf', page: 37, quote: 'KMS rotation was manually bypassed during migration.' }],
        tags: ['Cyber', 'SOC2', 'Encryption'],
        workflowState: 'remediating',
        reviewStatus: 'confirmed',
      },
      {
        id: 'find_04',
        domain: 'tax',
        severity: 'P2',
        title: 'State Nexus Multi-State Sales Tax Non-Compliance',
        description: 'Wayfair economic nexus exceeded in 14 jurisdictions without timely remittance or registration.',
        evidence: 'State Tax Nexus Study FY24-FY25',
        citations: [{ file: 'State_Tax_Nexus_Review.pdf', page: 9, quote: 'Estimated unreserved exposure is $1.2M plus statutory interest.' }],
        tags: ['Tax', 'Nexus', 'Wayfair'],
        workflowState: 'open',
        reviewStatus: 'ai_generated',
      },
    ];

    for (const f of findingsList) {
      sqlite.runSync(
        `INSERT OR REPLACE INTO findings (
          id, deal_id, domain, severity, title, description, evidence,
          citations_json, tags_json, workflow_state, review_status,
          conditions_json, audit_log_json, server_version, is_dirty, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', 1, 0, ?)`,
        [
          f.id,
          dealId,
          f.domain,
          f.severity,
          f.title,
          f.description,
          f.evidence,
          JSON.stringify(f.citations),
          JSON.stringify(f.tags),
          f.workflowState,
          f.reviewStatus,
          now,
        ]
      );
    }
  };

  const filteredDeals = deals.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.targetCompany.toLowerCase().includes(search.toLowerCase()) ||
      d.acquirer.toLowerCase().includes(search.toLowerCase())
  );

  const totalFindingsCount = deals.reduce((acc, d) => acc + (d.totalFindings || 0), 0);
  const avgRisk = deals.length
    ? (deals.reduce((acc, d) => acc + (d.overallRiskScore || 0), 0) / deals.length).toFixed(1)
    : '0.0';

  const handleSelectDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    router.push(`/deal/${deal.id}`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.headerTitle}>Deal Pipeline</Text>
            <Text style={styles.headerSubtitle}>Institutional M&A Diligence Engine</Text>
          </View>
          <View style={styles.offlineStatusPill}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>Encrypted Vault Sync</Text>
          </View>
        </View>

        {/* Executive Metrics Overview */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>ACTIVE DOSSIERS</Text>
            <Text style={styles.metricValue}>{deals.length}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>TOTAL FINDINGS</Text>
            <Text style={styles.metricValue}>{totalFindingsCount}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>AVG RISK SCORE</Text>
            <Text style={[styles.metricValue, { color: '#F59E0B' }]}>{avgRisk} / 10</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Search size={18} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search deals, targets, acquirers..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Deals List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#06B6D4" />
          </View>
        ) : (
          <FlatList
            data={filteredDeals}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchRemoteDeals();
                }}
                tintColor="#06B6D4"
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleSelectDeal(item)}>
                <GlowCard decision={item.goNoGo}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.dealName}>{item.name}</Text>
                      <Text style={styles.companySub}>
                        {item.targetCompany || 'Target Entity'} \u2192 {item.acquirer || 'Acquirer'}
                      </Text>
                    </View>
                    <ArrowUpRight size={20} color="#94A3B8" />
                  </View>

                  <View style={styles.cardFooter}>
                    <View style={styles.decisionBadge}>
                      <Text
                        style={[
                          styles.decisionText,
                          item.goNoGo === 'GO' && { color: '#10B981' },
                          item.goNoGo === 'CAUTION' && { color: '#F59E0B' },
                          item.goNoGo === 'NO-GO' && { color: '#F43F5E' },
                        ]}
                      >
                        {item.goNoGo || 'PENDING'}
                      </Text>
                    </View>

                    <View style={styles.badgeRow}>
                      <View style={styles.statPill}>
                        <ShieldAlert size={12} color="#06B6D4" style={{ marginRight: 4 }} />
                        <Text style={styles.statPillText}>{item.totalFindings} Findings</Text>
                      </View>
                      <View style={[styles.statPill, { marginLeft: 8 }]}>
                        <Text style={styles.statPillText}>Risk: {item.overallRiskScore || 0}/10</Text>
                      </View>
                    </View>
                  </View>
                </GlowCard>
              </TouchableOpacity>
            )}
          />
        )}
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  offlineStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#06B6D4',
    marginRight: 6,
  },
  offlineText: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#0E131F',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  metricBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E131F',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 10,
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dealName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  companySub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  decisionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  decisionText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#94A3B8',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statPillText: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '500',
  },
});
