import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  UploadCloud,
  RefreshCw,
  User,
  Pin,
  Sliders,
  DownloadCloud,
} from 'lucide-react-native';
import { SeverityBadge } from '../../src/components/ui/SeverityBadge';
import { FindingActionModal } from '../../src/components/actions/FindingActionModal';
import { VdrUploadModal } from '../../src/components/vdr/VdrUploadModal';
import { getEncryptedDb } from '../../src/db/client';
import { flushOutboxQueue, upsertFindingsToVault } from '../../src/db/outboxWorker';
import {
  getDeals,
  getDealFindings,
  syncJobFindings,
} from '../../src/services/webApi';
import { Deal, Finding, WorkflowState } from '../../src/types';

export default function ActionCenterScreen() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>('ALL');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowState | 'ALL' | 'NEEDS_REVIEW'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const [activeFinding, setActiveFinding] = useState<Finding | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [selectedDealId])
  );

  const refreshAll = async () => {
    setLoading(true);
    try {
      const serverDeals = await getDeals();
      const dealList = Array.isArray(serverDeals) ? serverDeals : [];
      setDeals(dealList);

      const targetDeals =
        selectedDealId === 'ALL'
          ? dealList.slice(0, 8)
          : dealList.filter((d) => (d._id || d.id) === selectedDealId);

      for (const d of targetDeals) {
        const dId = d._id || d.id;
        try {
          const res = await getDealFindings(dId, { limit: 100 });
          if (res?.findings?.length) {
            upsertFindingsToVault(dId, res.findings);
          } else if (d.latestJobId && d.status === 'done') {
            // Auto-sync findings from completed job into Mongo Finding collection
            await syncJobFindings(d.latestJobId).catch(() => {});
            const after = await getDealFindings(dId, { limit: 100 });
            if (after?.findings?.length) upsertFindingsToVault(dId, after.findings);
          }
        } catch {
          // ignore per-deal offline errors
        }
      }
    } catch {
      // Offline mode: use cached SQLite
    } finally {
      loadLocalFindings();
      setLoading(false);
    }
  };

  const loadLocalFindings = () => {
    try {
      const { sqlite } = getEncryptedDb();
      let sql = `SELECT * FROM findings`;
      const params: string[] = [];
      if (selectedDealId !== 'ALL') {
        sql += ` WHERE deal_id = ?`;
        params.push(selectedDealId);
      }
      sql += ` ORDER BY
        CASE review_status WHEN 'ai_generated' THEN 1 ELSE 2 END,
        CASE severity WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'P2' THEN 3 ELSE 4 END
        LIMIT 150`;

      const rows = sqlite.getAllSync<any>(sql, params);
      setFindings(
        (rows || []).map((r) => ({
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

      const outbox = sqlite.getFirstSync<{ c: number }>(
        `SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'PENDING'`
      );
      setPendingOutboxCount(outbox?.c || 0);
    } catch (e) {
      console.warn('Action center local query error:', e);
    }
  };

  const handleSyncAndFlush = async () => {
    setIsSyncing(true);
    try {
      const outboxRes = await flushOutboxQueue();
      const targetDeal =
        selectedDealId !== 'ALL'
          ? deals.find((d) => (d._id || d.id) === selectedDealId)
          : deals.find((d) => d.latestJobId && d.status === 'done');

      if (targetDeal?.latestJobId) {
        await syncJobFindings(targetDeal.latestJobId).catch(() => {});
      }
      await refreshAll();
      Alert.alert(
        'Action Center Synced',
        `Outbox flushed (${outboxRes.applied} applied, ${outboxRes.conflicts} conflicts) and findings refreshed from server.`
      );
    } catch (e: any) {
      Alert.alert('Sync Notice', 'Offline or server unreachable. Changes remain safely queued in outbox.');
    } finally {
      setIsSyncing(false);
    }
  };

  const counts = {
    open: findings.filter((f) => f.workflowState === 'open').length,
    assigned: findings.filter((f) => f.workflowState === 'assigned').length,
    remediating: findings.filter((f) => f.workflowState === 'remediating').length,
    verified: findings.filter((f) => f.workflowState === 'verified').length,
    closed: findings.filter((f) => f.workflowState === 'closed').length,
    needsReview: findings.filter((f) => f.reviewStatus === 'ai_generated').length,
  };

  const filtered = findings.filter((f) => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (workflowFilter === 'ALL') return true;
    if (workflowFilter === 'NEEDS_REVIEW') return f.reviewStatus === 'ai_generated';
    return f.workflowState === workflowFilter;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Risk Action Center</Text>
            <Text style={styles.subtitle}>Assign Tasks, Triage & Upload VDR Docs</Text>
          </View>

          <View style={styles.headerBtns}>
            <TouchableOpacity
              style={styles.uploadActionBtn}
              onPress={() => setUploadModalOpen(true)}
            >
              <UploadCloud size={14} color="#FFFFFF" />
              <Text style={styles.uploadActionText}>Upload</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.syncBtn, isSyncing && { opacity: 0.5 }]}
              onPress={handleSyncAndFlush}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#06B6D4" />
              ) : (
                <>
                  <RefreshCw size={14} color="#06B6D4" />
                  <Text style={styles.syncBtnText}>
                    {pendingOutboxCount > 0 ? `Sync (${pendingOutboxCount})` : 'Sync'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Deal Selector Ribbon */}
        <View style={styles.ribbonWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.dealChip, selectedDealId === 'ALL' && styles.dealChipActive]}
              onPress={() => setSelectedDealId('ALL')}
            >
              <Text
                style={[styles.dealChipText, selectedDealId === 'ALL' && styles.dealChipTextActive]}
              >
                All Deals
              </Text>
            </TouchableOpacity>
            {deals.map((d) => {
              const id = d._id || d.id;
              const active = selectedDealId === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.dealChip, active && styles.dealChipActive]}
                  onPress={() => setSelectedDealId(id)}
                >
                  <Text
                    style={[styles.dealChipText, active && styles.dealChipTextActive]}
                    numberOfLines={1}
                  >
                    {d.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 6-Tile Workflow KPI Filter Ribbon */}
        <View style={styles.kpiRibbonWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(
              [
                { key: 'ALL', label: 'All', count: findings.length, color: '#E2E8F0' },
                { key: 'open', label: 'Open', count: counts.open, color: '#94A3B8' },
                { key: 'assigned', label: 'Assigned', count: counts.assigned, color: '#60A5FA' },
                { key: 'remediating', label: 'Remediating', count: counts.remediating, color: '#F59E0B' },
                { key: 'verified', label: 'Verified', count: counts.verified, color: '#06B6D4' },
                { key: 'closed', label: 'Closed', count: counts.closed, color: '#10B981' },
                { key: 'NEEDS_REVIEW', label: 'Needs Review', count: counts.needsReview, color: '#A78BFA' },
              ] as const
            ).map((tile) => {
              const active = workflowFilter === tile.key;
              return (
                <TouchableOpacity
                  key={tile.key}
                  style={[styles.kpiTile, active && { borderColor: tile.color, backgroundColor: '#182032' }]}
                  onPress={() => setWorkflowFilter(tile.key as any)}
                >
                  <Text style={styles.kpiLabel}>{tile.label}</Text>
                  <Text style={[styles.kpiNum, { color: tile.color }]}>{tile.count}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Severity Filter Pills */}
        <View style={styles.sevRow}>
          {['ALL', 'P0', 'P1', 'P2', 'P3'].map((sev) => (
            <TouchableOpacity
              key={sev}
              style={[styles.sevPill, severityFilter === sev && styles.sevPillActive]}
              onPress={() => setSeverityFilter(sev)}
            >
              <Text style={[styles.sevPillText, severityFilter === sev && styles.sevPillTextActive]}>
                {sev}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Findings List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#06B6D4" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.centered}>
            <DownloadCloud size={32} color="#334155" />
            <Text style={styles.emptyTitle}>No Findings Matching Filter</Text>
            <Text style={styles.emptySub}>
              Tap Sync to pull completed job findings or Upload VDR docs to start a new audit.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.card, item.isDirty && styles.cardDirty]}
                onPress={() => {
                  setActiveFinding(item);
                  setActionModalOpen(true);
                }}
              >
                <View style={styles.cardTop}>
                  <SeverityBadge severity={item.severity} />
                  <View style={styles.statusPillsRow}>
                    <View style={styles.domainPill}>
                      <Text style={styles.domainPillText}>{item.domain.toUpperCase()}</Text>
                    </View>
                    <View style={styles.domainPill}>
                      <Text style={styles.domainPillText}>{item.workflowState.toUpperCase()}</Text>
                    </View>
                    <View
                      style={[
                        styles.reviewStatusPill,
                        item.reviewStatus === 'confirmed' && styles.statusConfirmed,
                        item.reviewStatus === 'rejected' && styles.statusRejected,
                      ]}
                    >
                      <Text style={styles.reviewStatusText}>
                        {item.reviewStatus.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.findingTitle}>{item.title}</Text>
                <Text style={styles.findingDesc} numberOfLines={2}>
                  {item.description}
                </Text>

                <View style={styles.cardFooter}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {item.assignedTo ? (
                      <View style={styles.metaBadge}>
                        <User size={11} color="#60A5FA" style={{ marginRight: 4 }} />
                        <Text style={styles.metaBadgeText} numberOfLines={1}>
                          {item.assignedTo}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.unassignedText}>Unassigned</Text>
                    )}

                    {item.conditions?.length > 0 && (
                      <View style={[styles.metaBadge, { marginLeft: 8 }]}>
                        <Pin size={11} color="#06B6D4" style={{ marginRight: 3 }} />
                        <Text style={styles.metaBadgeText}>{item.conditions.length} Cond.</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.manageBtn}>
                    <Sliders size={12} color="#06B6D4" style={{ marginRight: 4 }} />
                    <Text style={styles.manageBtnText}>Manage / Assign</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        <FindingActionModal
          visible={actionModalOpen}
          finding={activeFinding}
          onClose={() => setActionModalOpen(false)}
          onUpdated={refreshAll}
        />

        <VdrUploadModal
          visible={uploadModalOpen}
          initialDealId={selectedDealId !== 'ALL' ? selectedDealId : undefined}
          onClose={() => setUploadModalOpen(false)}
          onUploaded={() => refreshAll()}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0891B2',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  uploadActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    gap: 5,
  },
  syncBtnText: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '700',
  },
  ribbonWrap: {
    marginBottom: 10,
  },
  dealChip: {
    backgroundColor: '#0E131F',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 160,
  },
  dealChipActive: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.16)',
  },
  dealChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  dealChipTextActive: {
    color: '#93C5FD',
  },
  kpiRibbonWrap: {
    marginBottom: 10,
  },
  kpiTile: {
    backgroundColor: '#0E131F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 78,
  },
  kpiLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
  },
  kpiNum: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  sevRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  sevPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#0E131F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sevPillActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
  },
  sevPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  sevPillTextActive: {
    color: '#67E8F9',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#0E131F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 10,
  },
  cardDirty: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  statusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  domainPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  domainPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  reviewStatusPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusConfirmed: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusRejected: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
  },
  reviewStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  findingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  findingDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    maxWidth: 140,
  },
  metaBadgeText: {
    fontSize: 10,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  unassignedText: {
    fontSize: 10,
    color: '#64748B',
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  manageBtnText: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '700',
  },
});
