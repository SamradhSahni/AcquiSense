import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckSquare,
  CheckCircle,
  XCircle,
  UserPlus,
  PlusCircle,
  RefreshCw,
  AlertTriangle,
  Send,
} from 'lucide-react-native';
import { SeverityBadge } from '../../src/components/ui/SeverityBadge';
import { getEncryptedDb } from '../../src/db/client';
import { enqueueOrCoalesceMutation, flushOutboxQueue } from '../../src/db/outboxWorker';
import { Finding } from '../../src/types';

export default function ActionCenterScreen() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conditionModalVisible, setConditionModalVisible] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [conditionText, setConditionText] = useState('');

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    try {
      const { sqlite } = getEncryptedDb();
      const rows = sqlite.getAllSync<any>(`
        SELECT * FROM findings
        ORDER BY
          CASE review_status WHEN 'ai_generated' THEN 1 ELSE 2 END,
          CASE severity WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'P2' THEN 3 ELSE 4 END
        LIMIT 60
      `);

      if (rows) {
        setFindings(
          rows.map((r) => ({
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
      }

      const outbox = sqlite.getFirstSync<{ c: number }>(
        `SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'PENDING'`
      );
      setPendingOutboxCount(outbox?.c || 0);
    } catch (e) {
      console.warn('Action center load error:', e);
    }
  };

  const handleTriageAction = (
    finding: Finding,
    action: 'confirm' | 'reject' | 'assign',
    assignee?: string
  ) => {
    try {
      let patch = {};
      if (action === 'confirm') {
        patch = { reviewStatus: 'confirmed', workflowState: 'verified' };
      } else if (action === 'reject') {
        patch = { reviewStatus: 'rejected', workflowState: 'closed' };
      } else if (action === 'assign') {
        patch = { workflowState: 'assigned', assignedTo: assignee || 'Senior Legal Counsel' };
      }

      enqueueOrCoalesceMutation({
        dealId: finding.dealId,
        findingId: finding.id,
        actionName: action,
        patch,
        notes: `Triage action: ${action} executed from Mobile Action Center`,
      });

      refreshData();
    } catch (e: any) {
      Alert.alert('Action Error', e.message);
    }
  };

  const handleAddCondition = () => {
    if (!conditionText.trim() || !selectedFindingId) return;
    const target = findings.find((f) => f.id === selectedFindingId);
    if (!target) return;

    try {
      enqueueOrCoalesceMutation({
        dealId: target.dealId,
        findingId: target.id,
        actionName: 'add_closing_condition',
        patch: {
          addedConditions: [{ text: conditionText.trim() }],
        },
        notes: 'Closing condition added from mobile',
      });

      setConditionText('');
      setConditionModalVisible(false);
      setSelectedFindingId(null);
      refreshData();
      Alert.alert('Condition Queued', 'Closing condition merged into coalescing outbox queue.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleFlushSync = async () => {
    setIsSyncing(true);
    try {
      const result = await flushOutboxQueue();
      refreshData();
      Alert.alert(
        'Outbox Synchronized',
        `Batch sync applied: ${result.applied} mutations.\nConflicts detected: ${result.conflicts}.`
      );
    } catch (e: any) {
      Alert.alert('Sync Notice', 'Offline or server unreachable. Changes safely stored in encrypted outbox.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Risk Action Center</Text>
            <Text style={styles.subtitle}>Executive Triage & Closing Conditions</Text>
          </View>

          <TouchableOpacity
            style={[styles.syncBtn, isSyncing && { opacity: 0.5 }]}
            onPress={handleFlushSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#06B6D4" />
            ) : (
              <>
                <RefreshCw size={14} color="#06B6D4" style={{ marginRight: 6 }} />
                <Text style={styles.syncBtnText}>
                  Sync ({pendingOutboxCount})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Triage Findings List */}
        <FlatList
          data={findings}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.card, item.isDirty && styles.cardDirty]}>
              <View style={styles.cardTop}>
                <SeverityBadge severity={item.severity} />
                <View style={styles.statusPillsRow}>
                  <View style={styles.domainPill}>
                    <Text style={styles.domainPillText}>{item.domain.toUpperCase()}</Text>
                  </View>
                  <View
                    style={[
                      styles.reviewStatusPill,
                      item.reviewStatus === 'confirmed' && styles.statusConfirmed,
                      item.reviewStatus === 'rejected' && styles.statusRejected,
                    ]}
                  >
                    <Text style={styles.reviewStatusText}>{item.reviewStatus.toUpperCase()}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.findingTitle}>{item.title}</Text>
              <Text style={styles.findingDesc} numberOfLines={2}>
                {item.description}
              </Text>

              {item.conditions && item.conditions.length > 0 && (
                <View style={styles.conditionsBox}>
                  <Text style={styles.conditionsHeader}>
                    CLOSING CONDITIONS ({item.conditions.length}):
                  </Text>
                  {item.conditions.map((c, i) => (
                    <Text key={i} style={styles.conditionItem} numberOfLines={1}>
                      {'\u2022'} {c.text}
                    </Text>
                  ))}
                </View>
              )}

              {/* Triage Button Controls */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.confirmBtn]}
                  onPress={() => handleTriageAction(item, 'confirm')}
                >
                  <CheckCircle size={14} color="#10B981" style={{ marginRight: 4 }} />
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.assignBtn]}
                  onPress={() => handleTriageAction(item, 'assign', 'Senior Partner')}
                >
                  <UserPlus size={14} color="#3B82F6" style={{ marginRight: 4 }} />
                  <Text style={styles.assignBtnText}>Assign</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.conditionBtn]}
                  onPress={() => {
                    setSelectedFindingId(item.id);
                    setConditionModalVisible(true);
                  }}
                >
                  <PlusCircle size={14} color="#06B6D4" style={{ marginRight: 4 }} />
                  <Text style={styles.conditionBtnText}>Condition</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleTriageAction(item, 'reject')}
                >
                  <XCircle size={14} color="#F43F5E" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />

        {/* Modal for adding Closing Condition */}
        <Modal
          visible={conditionModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setConditionModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Closing Condition</Text>
              <Text style={styles.modalDesc}>
                Define an escrow holdback, indemnity clause, or covenant requirement.
              </Text>

              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Require target to escrow $2.5M until IP assignment is perfected."
                placeholderTextColor="#64748B"
                multiline
                numberOfLines={3}
                value={conditionText}
                onChangeText={setConditionText}
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setConditionModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleAddCondition}>
                  <Send size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.modalSubmitText}>Save & Queue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  syncBtnText: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0E131F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 12,
  },
  cardDirty: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  domainPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  domainPillText: {
    fontSize: 10,
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
  conditionsBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.05)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  conditionsHeader: {
    fontSize: 9,
    fontWeight: '700',
    color: '#06B6D4',
    marginBottom: 4,
  },
  conditionItem: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  confirmBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  confirmBtnText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
  },
  assignBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  assignBtnText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  conditionBtn: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  conditionBtnText: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '600',
  },
  rejectBtn: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    paddingHorizontal: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#0E131F',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  modalDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#182032',
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFF',
    fontSize: 13,
    textAlignVertical: 'top',
    height: 80,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  modalCancelText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0891B2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

