import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  X,
  UserPlus,
  Wrench,
  CheckCircle2,
  CheckCheck,
  PlusCircle,
  Edit3,
  XCircle,
  Clock,
  Pin,
  History,
} from 'lucide-react-native';
import { SeverityBadge } from '../ui/SeverityBadge';
import { Finding, Severity, TeamUser, WorkflowState } from '../../types';
import { actionFinding, reviewFinding, getCompanyUsers } from '../../services/webApi';
import { enqueueOrCoalesceMutation } from '../../db/outboxWorker';
import { useAuthStore } from '../../stores/useAuthStore';

type ActionMode = 'overview' | 'assign' | 'progress' | 'condition' | 'confirm' | 'modify' | 'reject';

interface Props {
  visible: boolean;
  finding: Finding | null;
  onClose: () => void;
  onUpdated: () => void;
}

const WORKFLOW_STATES: { value: WorkflowState; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: '#94A3B8' },
  { value: 'assigned', label: 'Assigned', color: '#3B82F6' },
  { value: 'remediating', label: 'Remediating', color: '#F59E0B' },
  { value: 'verified', label: 'Verified', color: '#06B6D4' },
  { value: 'closed', label: 'Closed', color: '#10B981' },
];

export const FindingActionModal: React.FC<Props> = ({
  visible,
  finding,
  onClose,
  onUpdated,
}) => {
  const { user } = useAuthStore();
  const [mode, setMode] = useState<ActionMode>('overview');
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [assignTo, setAssignTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [condText, setCondText] = useState('');
  const [newState, setNewState] = useState<WorkflowState>('remediating');
  const [notes, setNotes] = useState('');
  const [modTitle, setModTitle] = useState('');
  const [modDesc, setModDesc] = useState('');
  const [modSev, setModSev] = useState<Severity>('P2');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible && finding) {
      setMode('overview');
      setAssignTo(finding.assignedTo || '');
      setDueDate(finding.dueDate ? String(finding.dueDate).slice(0, 10) : '');
      setCondText('');
      setNotes('');
      setModTitle(finding.title || '');
      setModDesc(finding.description || '');
      setModSev(finding.severity || 'P2');
      setNewState(
        finding.workflowState === 'assigned'
          ? 'remediating'
          : finding.workflowState === 'remediating'
          ? 'verified'
          : 'closed'
      );

      getCompanyUsers()
        .then((res) => setTeamUsers(res?.users || []))
        .catch(() => {});
    }
  }, [visible, finding]);

  if (!visible || !finding) return null;

  const actorEmail = user?.email || 'analyst@acquisense.io';

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const targetId = finding._id || finding.id;
      let offlinePatch: any = {};

      if (mode === 'confirm' || mode === 'reject' || mode === 'modify') {
        const reviewStatus =
          mode === 'modify' ? 'modified' : mode === 'confirm' ? 'confirmed' : 'rejected';

        offlinePatch = {
          reviewStatus,
          analystNotes: notes,
          ...(mode === 'modify'
            ? { title: modTitle.trim(), description: modDesc.trim(), severity: modSev }
            : {}),
        };

        try {
          await reviewFinding(targetId, {
            reviewStatus,
            by: actorEmail,
            notes,
            ...(mode === 'modify'
              ? { title: modTitle.trim(), description: modDesc.trim(), severity: modSev }
              : {}),
          });
        } catch (netErr) {
          // Persist via coalescing outbox when offline or on local mock items
          enqueueOrCoalesceMutation({
            dealId: finding.dealId,
            findingId: finding.id,
            actionName: mode,
            patch: offlinePatch,
            notes,
          });
        }
      } else {
        const actionType =
          mode === 'assign'
            ? 'assign'
            : mode === 'condition'
            ? 'add_condition'
            : 'progress';

        if (mode === 'assign') {
          if (!assignTo.trim()) {
            Alert.alert('Required', 'Please enter or select an assignee email.');
            setSubmitting(false);
            return;
          }
          offlinePatch = {
            workflowState: 'assigned',
            assignedTo: assignTo.trim(),
            dueDate: dueDate.trim() || undefined,
          };
        } else if (mode === 'condition') {
          if (!condText.trim()) {
            Alert.alert('Required', 'Please enter a closing condition.');
            setSubmitting(false);
            return;
          }
          offlinePatch = { addedConditions: [{ text: condText.trim() }] };
        } else if (mode === 'progress') {
          offlinePatch = { workflowState: newState };
        }

        try {
          await actionFinding(targetId, {
            action: actionType,
            payload: {
              assignedTo: assignTo.trim(),
              dueDate: dueDate.trim() || undefined,
              text: condText.trim(),
              workflowState: newState,
            },
            by: actorEmail,
            notes,
          });
        } catch (netErr) {
          enqueueOrCoalesceMutation({
            dealId: finding.dealId,
            findingId: finding.id,
            actionName: mode,
            patch: offlinePatch,
            notes,
          });
        }
      }

      onUpdated();
      onClose();
    } catch (err: any) {
      Alert.alert('Update Failed', err?.response?.data?.error || err?.message || 'Error updating finding');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={styles.badgeRow}>
                <SeverityBadge severity={finding.severity} />
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{finding.domain.toUpperCase()}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{finding.workflowState.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.title}>{finding.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
            {/* Action Mode Selector Grid */}
            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'assign' && styles.modeBtnActive]}
                onPress={() => setMode('assign')}
              >
                <UserPlus size={14} color="#60A5FA" />
                <Text style={styles.modeBtnText}>Assign Task</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === 'progress' && styles.modeBtnActive]}
                onPress={() => setMode('progress')}
              >
                <Wrench size={14} color="#FBBF24" />
                <Text style={styles.modeBtnText}>Workflow State</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === 'condition' && styles.modeBtnActive]}
                onPress={() => setMode('condition')}
              >
                <PlusCircle size={14} color="#22D3EE" />
                <Text style={styles.modeBtnText}>Condition</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === 'confirm' && styles.modeBtnActive]}
                onPress={() => setMode('confirm')}
              >
                <CheckCircle2 size={14} color="#34D399" />
                <Text style={styles.modeBtnText}>Confirm</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === 'modify' && styles.modeBtnActive]}
                onPress={() => setMode('modify')}
              >
                <Edit3 size={14} color="#A78BFA" />
                <Text style={styles.modeBtnText}>Modify</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, mode === 'reject' && styles.modeBtnActive]}
                onPress={() => setMode('reject')}
              >
                <XCircle size={14} color="#FB7185" />
                <Text style={styles.modeBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>

            {/* Mode Forms */}
            {mode === 'overview' && (
              <View style={styles.overviewBox}>
                <Text style={styles.descText}>{finding.description || 'No description provided.'}</Text>
                {finding.assignedTo && (
                  <Text style={styles.metaText}>
                    Assigned To: <Text style={styles.metaBold}>{finding.assignedTo}</Text>
                    {finding.dueDate ? `  •  Due: ${String(finding.dueDate).slice(0, 10)}` : ''}
                  </Text>
                )}

                {finding.conditions && finding.conditions.length > 0 && (
                  <View style={styles.subSection}>
                    <Text style={styles.subHeader}>CLOSING CONDITIONS ({finding.conditions.length})</Text>
                    {finding.conditions.map((c, idx) => (
                      <View key={c._id || idx} style={styles.conditionRow}>
                        <Pin size={12} color="#06B6D4" style={{ marginRight: 6 }} />
                        <Text style={styles.conditionText}>
                          {c.text} {c.addedBy ? `— ${c.addedBy}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {finding.auditLog && finding.auditLog.length > 0 && (
                  <View style={styles.subSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <History size={12} color="#64748B" style={{ marginRight: 6 }} />
                      <Text style={[styles.subHeader, { marginBottom: 0 }]}>
                        IMMUTABLE AUDIT LOG ({finding.auditLog.length})
                      </Text>
                    </View>
                    {finding.auditLog.slice(-6).reverse().map((a, idx) => (
                      <View key={idx} style={styles.auditRow}>
                        <Text style={styles.auditAction}>{a.action}</Text>
                        <Text style={styles.auditMeta}>
                          by {a.by || 'analyst'} • {a.at ? new Date(a.at).toLocaleString() : ''}
                        </Text>
                        {a.notes ? <Text style={styles.auditNotes}>"{a.notes}"</Text> : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {mode === 'assign' && (
              <View style={styles.formBox}>
                <Text style={styles.label}>ASSIGNEE EMAIL *</Text>
                <TextInput
                  style={styles.input}
                  value={assignTo}
                  onChangeText={setAssignTo}
                  placeholder="counsel@firm.com"
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                {teamUsers.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={styles.quickPickLabel}>QUICK PICK TEAM MEMBER:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {teamUsers.map((u) => (
                        <TouchableOpacity
                          key={u._id}
                          style={[
                            styles.userChip,
                            assignTo === u.email && styles.userChipActive,
                          ]}
                          onPress={() => setAssignTo(u.email)}
                        >
                          <Text style={styles.userChipText}>
                            {u.name} ({u.email})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.label}>DUE DATE (YYYY-MM-DD, OPTIONAL)</Text>
                <TextInput
                  style={styles.input}
                  value={dueDate}
                  onChangeText={setDueDate}
                  placeholder="2026-12-15"
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.label}>HANDOFF NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Context or SLA deadline instructions..."
                  placeholderTextColor="#64748B"
                  multiline
                />
              </View>
            )}

            {mode === 'progress' && (
              <View style={styles.formBox}>
                <Text style={styles.label}>TRANSITION WORKFLOW STATE</Text>
                <View style={styles.stateRow}>
                  {WORKFLOW_STATES.map((st) => (
                    <TouchableOpacity
                      key={st.value}
                      style={[
                        styles.stateChip,
                        newState === st.value && {
                          borderColor: st.color,
                          backgroundColor: 'rgba(255,255,255,0.08)',
                        },
                      ]}
                      onPress={() => setNewState(st.value)}
                    >
                      <Text
                        style={[
                          styles.stateChipText,
                          newState === st.value && { color: st.color },
                        ]}
                      >
                        {st.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>VERIFICATION / REMEDIATION NOTES</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Document remediation evidence or sign-off notes..."
                  placeholderTextColor="#64748B"
                  multiline
                />
              </View>
            )}

            {mode === 'condition' && (
              <View style={styles.formBox}>
                <Text style={styles.label}>CLOSING CONDITION / COVENANT *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={condText}
                  onChangeText={setCondText}
                  placeholder="e.g. Escrow $2.5M holdback until IP assignment perfected."
                  placeholderTextColor="#64748B"
                  multiline
                />
                <Text style={styles.label}>RATIONALE NOTES (OPTIONAL)</Text>
                <TextInput
                  style={styles.input}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="SPA section reference..."
                  placeholderTextColor="#64748B"
                />
              </View>
            )}

            {(mode === 'confirm' || mode === 'reject') && (
              <View style={styles.formBox}>
                <Text style={styles.label}>
                  {mode === 'confirm' ? 'CONFIRMATION NOTES (OPTIONAL)' : 'REJECTION REASON (OPTIONAL)'}
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={
                    mode === 'reject'
                      ? 'Explain why this AI finding is a false positive...'
                      : 'Sign-off verification notes...'
                  }
                  placeholderTextColor="#64748B"
                  multiline
                />
              </View>
            )}

            {mode === 'modify' && (
              <View style={styles.formBox}>
                <Text style={styles.label}>CALIBRATED TITLE</Text>
                <TextInput
                  style={styles.input}
                  value={modTitle}
                  onChangeText={setModTitle}
                />

                <Text style={styles.label}>CALIBRATED SEVERITY</Text>
                <View style={styles.sevRow}>
                  {(['P0', 'P1', 'P2', 'P3'] as Severity[]).map((sev) => (
                    <TouchableOpacity
                      key={sev}
                      style={[styles.sevChip, modSev === sev && styles.sevChipActive]}
                      onPress={() => setModSev(sev)}
                    >
                      <Text
                        style={[styles.sevChipText, modSev === sev && { color: '#06B6D4' }]}
                      >
                        {sev}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>CALIBRATED DESCRIPTION</Text>
                <TextInput
                  style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                  value={modDesc}
                  onChangeText={setModDesc}
                  multiline
                />

                <Text style={styles.label}>CHANGE RATIONALE</Text>
                <TextInput
                  style={styles.input}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="What did you modify and why?"
                  placeholderTextColor="#64748B"
                />
              </View>
            )}
          </ScrollView>

          {mode !== 'overview' && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setMode('overview')}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Action</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0E131F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    maxHeight: '88%',
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    marginBottom: 8,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#182032',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modeBtnActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  overviewBox: {
    paddingBottom: 16,
  },
  descText: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 19,
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
  },
  metaBold: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  subSection: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  subHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  conditionText: {
    fontSize: 12,
    color: '#E2E8F0',
    flex: 1,
  },
  auditRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  auditAction: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06B6D4',
  },
  auditMeta: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  auditNotes: {
    fontSize: 11,
    color: '#CBD5E1',
    fontStyle: 'italic',
    marginTop: 2,
  },
  formBox: {
    paddingBottom: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.7,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#182032',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  textArea: {
    height: 72,
    textAlignVertical: 'top',
  },
  quickPickLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 8,
    marginBottom: 6,
  },
  userChip: {
    backgroundColor: '#182032',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userChipActive: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.18)',
  },
  userChipText: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  stateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stateChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  stateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  sevRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sevChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#182032',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sevChipActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
  },
  sevChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
    minWidth: 110,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
