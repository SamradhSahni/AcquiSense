import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  ShieldAlert,
  ArrowUpRight,
  Plus,
  FileText,
  Trash2,
  Terminal,
} from 'lucide-react-native';
import { GlowCard } from '../../src/components/ui/GlowCard';
import { CommandPaletteModal } from '../../src/components/ui/CommandPaletteModal';
import { useDealStore } from '../../src/stores/useDealStore';
import { getDeals, deleteDeal } from '../../src/services/webApi';
import { getEncryptedDb } from '../../src/db/client';
import { Deal } from '../../src/types';

type StatusFilter = 'all' | 'analyzing' | 'done' | 'draft' | 'failed';

export default function DealPipelineScreen() {
  const router = useRouter();
  const { setSelectedDeal, setActiveTab } = useDealStore();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadLocalDeals();
      fetchRemoteDeals();
    }, [])
  );

  const loadLocalDeals = () => {
    try {
      const { sqlite } = getEncryptedDb();
      const rows = sqlite.getAllSync<any>(`SELECT * FROM deals ORDER BY updated_at DESC`);
      if (rows && rows.length > 0) {
        setDeals(
          rows.map((r) => ({
            id: r.id,
            _id: r.id,
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
      const data = await getDeals();
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
                name = excluded.name,
                target_company = excluded.target_company,
                acquirer = excluded.acquirer,
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
        // Preserve full files array from server response
        setDeals(
          data.map((d) => ({
            ...d,
            id: d._id || d.id,
          }))
        );
      }
    } catch (e) {
      console.warn('Remote deals fetch error (offline mode active):', e);
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
        4,
        'Overall target profile demonstrates robust 48% YoY ARR growth, but critical liabilities in open-source copyleft licenses and unrecorded sales tax obligations warrant an escrow adjustment of $8.5M.',
        now,
      ]
    );
  };

  const handleDeleteDeal = (deal: Deal) => {
    const dealId = deal._id || deal.id;
    Alert.alert('Delete Deal Vault', `Permanently delete "${deal.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDeal(dealId);
          } catch {
            // offline ignore
          }
          try {
            const { sqlite } = getEncryptedDb();
            sqlite.runSync(`DELETE FROM deals WHERE id = ?`, [dealId]);
            sqlite.runSync(`DELETE FROM findings WHERE deal_id = ?`, [dealId]);
          } catch {
            // ignore
          }
          setDeals((prev) => prev.filter((d) => (d._id || d.id) !== dealId));
        },
      },
    ]);
  };

  const filteredDeals = deals.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.targetCompany || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.acquirer || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'analyzing') return d.status === 'analyzing' || d.status === 'queued';
    return d.status === statusFilter;
  });

  const completedCount = deals.filter((d) => d.status === 'done').length;
  const activeInFlight = deals.filter((d) => d.status === 'analyzing' || d.status === 'queued').length;
  const scored = deals.filter((d) => (d.overallRiskScore || 0) > 0);
  const avgRisk = scored.length
    ? (scored.reduce((acc, d) => acc + (d.overallRiskScore || 0), 0) / scored.length).toFixed(1)
    : '0.0';

  const handleSelectDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    setActiveTab(deal.status === 'analyzing' || deal.status === 'queued' ? 'agents' : 'verdict');
    router.push(`/deal/${deal._id || deal.id}`);
  };

  const getRiskColor = (score: number) => {
    if (score >= 7) return '#F43F5E';
    if (score >= 4) return '#F59E0B';
    if (score > 0) return '#10B981';
    return '#64748B';
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
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.cmdBtn} onPress={() => setCmdOpen(true)}>
              <Terminal size={15} color="#06B6D4" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.newDealBtn}
              onPress={() => router.push('/(tabs)/new-deal')}
            >
              <Plus size={15} color="#FFFFFF" />
              <Text style={styles.newDealBtnText}>New Deal</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4 Executive KPI Cards */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>TOTAL DEALS</Text>
            <Text style={styles.metricValue}>{deals.length}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>COMPLETE</Text>
            <Text style={[styles.metricValue, { color: '#10B981' }]}>{completedCount}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>IN FLIGHT</Text>
            <Text style={[styles.metricValue, { color: '#06B6D4' }]}>{activeInFlight}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>AVG RISK</Text>
            <Text style={[styles.metricValue, { color: '#F59E0B' }]}>{avgRisk}</Text>
          </View>
        </View>

        {/* Search & Status Filters */}
        <View style={styles.searchBar}>
          <Search size={17} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search deals, targets, acquirers..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'analyzing', label: 'Analyzing' },
                { key: 'done', label: 'Complete' },
                { key: 'draft', label: 'Draft' },
                { key: 'failed', label: 'Failed' },
              ] as const
            ).map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterPill, statusFilter === f.key && styles.filterPillActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    statusFilter === f.key && styles.filterPillTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Deals List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#06B6D4" />
          </View>
        ) : filteredDeals.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Matching Deals</Text>
            <Text style={styles.emptySub}>
              Tap "+ New Deal" to upload VDR files and deploy the 13 forensic AI agents.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredDeals}
            keyExtractor={(item) => item._id || item.id}
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
            renderItem={({ item }) => {
              const riskScore = Number(item.overallRiskScore || 0);
              const riskPct = Math.min(100, Math.max(0, (riskScore / 10) * 100));
              const riskColor = getRiskColor(riskScore);

              return (
                <TouchableOpacity onPress={() => handleSelectDeal(item)}>
                  <GlowCard decision={item.goNoGo}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.dealName}>{item.name}</Text>
                        <Text style={styles.companySub}>
                          {item.targetCompany || 'Target Entity'} {'\u2192'}{' '}
                          {item.acquirer || 'Acquirer'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDeleteDeal(item)}
                        style={{ padding: 4, marginRight: 4 }}
                      >
                        <Trash2 size={16} color="#64748B" />
                      </TouchableOpacity>
                      <ArrowUpRight size={20} color="#94A3B8" />
                    </View>

                    {/* Risk Meter */}
                    <View style={styles.riskWrap}>
                      <View style={styles.riskRow}>
                        <Text style={styles.riskLabel}>Forensic Risk Score</Text>
                        <Text style={[styles.riskVal, { color: riskColor }]}>
                          {riskScore > 0 ? riskScore.toFixed(1) : '—'} / 10
                        </Text>
                      </View>
                      <View style={styles.riskTrack}>
                        <View
                          style={[
                            styles.riskFill,
                            { width: `${riskPct}%`, backgroundColor: riskColor },
                          ]}
                        />
                      </View>
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
                          {item.goNoGo || item.status.toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.badgeRow}>
                        <View style={styles.statPill}>
                          <ShieldAlert size={12} color="#06B6D4" style={{ marginRight: 4 }} />
                          <Text style={styles.statPillText}>
                            {item.totalFindings || 0} Findings
                          </Text>
                        </View>
                        {item.files && item.files.length > 0 && (
                          <View style={[styles.statPill, { marginLeft: 6 }]}>
                            <FileText size={12} color="#60A5FA" style={{ marginRight: 4 }} />
                            <Text style={styles.statPillText}>{item.files.length} Docs</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </GlowCard>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <CommandPaletteModal visible={cmdOpen} onClose={() => setCmdOpen(false)} />
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
    marginBottom: 14,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cmdBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#0E131F',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newDealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0891B2',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    gap: 5,
  },
  newDealBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#0E131F',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  metricBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 3,
  },
  metricDivider: {
    width: 1,
    height: 22,
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
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 9,
    fontSize: 13,
  },
  filterPill: {
    backgroundColor: '#0E131F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
  },
  filterPillActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
  },
  filterPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#67E8F9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
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
  riskWrap: {
    marginBottom: 10,
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  riskLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  riskVal: {
    fontSize: 11,
    fontWeight: '800',
  },
  riskTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  riskFill: {
    height: '100%',
    borderRadius: 2,
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
