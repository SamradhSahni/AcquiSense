import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Key,
  Database,
  Lock,
  Trash2,
  LogOut,
  AlertOctagon,
  CheckCircle2,
  Users,
  UserPlus,
  Server,
  X,
} from 'lucide-react-native';
import { executeEmergencyMnpiWipe } from '../../src/db/client';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { getApiBaseUrl, setCustomApiBaseUrl } from '../../src/services/api';
import {
  createCompanyUser,
  getCompanyGroups,
  getCompanyUsers,
  getGatewayHealth,
} from '../../src/services/webApi';
import { TeamUser, UserGroup } from '../../src/types';

export default function SecurityAndTeamScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [wiping, setWiping] = useState(false);

  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [healthStatus, setHealthStatus] = useState<'unknown' | 'ok' | 'down'>('unknown');

  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invPassword, setInvPassword] = useState('');
  const [invGroupId, setInvGroupId] = useState('');
  const [inviting, setInviting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setServerUrl(getApiBaseUrl());
      checkHealth();
      loadTeam();
    }, [])
  );

  const checkHealth = async () => {
    try {
      const res = await getGatewayHealth();
      setHealthStatus(res?.status === 'ok' ? 'ok' : 'down');
    } catch {
      setHealthStatus('down');
    }
  };

  const loadTeam = async () => {
    try {
      const [uRes, gRes] = await Promise.all([
        getCompanyUsers().catch(() => ({ users: [] })),
        getCompanyGroups().catch(() => ({ groups: [] })),
      ]);
      setTeamUsers(uRes?.users || []);
      const gList = gRes?.groups || [];
      setGroups(gList);
      if (gList.length > 0 && !invGroupId) {
        setInvGroupId(gList[0].id || (gList[0] as any)._id || '');
      }
    } catch {
      // ignore offline
    }
  };

  const handleSaveServerUrl = async () => {
    if (!serverUrl.trim().startsWith('http')) {
      Alert.alert('Invalid URL', 'Gateway URL must start with http:// or https://');
      return;
    }
    const saved = await setCustomApiBaseUrl(serverUrl.trim());
    setServerUrl(saved);
    await checkHealth();
    Alert.alert('Gateway Updated', `Mobile API target set to:\n${saved}`);
  };

  const handleInviteUser = async () => {
    if (!invName.trim() || !invEmail.trim() || invPassword.length < 6) {
      Alert.alert('Validation Error', 'Name, email, and password (min 6 chars) are required.');
      return;
    }
    setInviting(true);
    try {
      await createCompanyUser({
        name: invName.trim(),
        email: invEmail.trim(),
        password: invPassword,
        groupIds: invGroupId ? [invGroupId] : [],
      });
      setInviteOpen(false);
      setInvName('');
      setInvEmail('');
      setInvPassword('');
      await loadTeam();
      Alert.alert('Member Provisioned', 'Analyst account added to your firm organization.');
    } catch (err: any) {
      Alert.alert(
        'Provisioning Error',
        err?.response?.data?.error || err?.message || 'Unable to create user.'
      );
    } finally {
      setInviting(false);
    }
  };

  const handleSimulateRemoteWipe = () => {
    Alert.alert(
      'Trigger Emergency MNPI Kill-Switch',
      'This will immediately shred the SQLCipher AES-256 database, delete all Android Keystore hardware keys, clear MMKV encrypted state, and revoke session tokens.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'CONFIRM EMERGENCY WIPE',
          style: 'destructive',
          onPress: async () => {
            setWiping(true);
            try {
              await executeEmergencyMnpiWipe();
              await logout();
              Alert.alert(
                'Kill-Switch Executed',
                'Device successfully sanitized. All confidential M&A records and cryptographic keys have been destroyed.',
                [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
              );
            } catch (e: any) {
              Alert.alert('Wipe Error', e.message);
            } finally {
              setWiping(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Team & Vault Security</Text>
          <Text style={styles.subtitle}>Organization Roster, Gateway & Zero-Trust Posture</Text>
        </View>

        {/* User Profile Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'A'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.userName}>{user?.name || 'Institutional Analyst'}</Text>
              <Text style={styles.userEmail}>{user?.email || 'analyst@acquisense.io'}</Text>
              <Text style={styles.userOrg}>{user?.company?.name || 'Firm Organization'}</Text>
            </View>
          </View>
        </View>

        {/* Team Members Management */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>FIRM TEAM ROSTER ({teamUsers.length})</Text>
          <TouchableOpacity style={styles.inviteBtn} onPress={() => setInviteOpen(true)}>
            <UserPlus size={12} color="#06B6D4" />
            <Text style={styles.inviteBtnText}>Add Member</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {teamUsers.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Users size={16} color="#64748B" style={{ marginRight: 8 }} />
              <Text style={styles.emptyTeamText}>
                Connect to gateway or tap "Add Member" to manage analysts & assignees.
              </Text>
            </View>
          ) : (
            teamUsers.slice(0, 8).map((u, idx) => (
              <View
                key={u._id}
                style={[styles.teamRow, idx > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamName}>{u.name}</Text>
                  <Text style={styles.teamEmail}>{u.email}</Text>
                </View>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>
                    {u.groups?.[0]?.name?.toUpperCase() || 'ANALYST'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Gateway Endpoint Config */}
        <Text style={styles.sectionHeader}>GATEWAY CONNECTION</Text>
        <View style={styles.card}>
          <View style={styles.gatewayStatusRow}>
            <Server size={15} color="#06B6D4" style={{ marginRight: 8 }} />
            <Text style={styles.gatewayStatusText}>
              Status:{' '}
              <Text
                style={{
                  color:
                    healthStatus === 'ok'
                      ? '#10B981'
                      : healthStatus === 'down'
                      ? '#F43F5E'
                      : '#94A3B8',
                  fontWeight: '700',
                }}
              >
                {healthStatus === 'ok'
                  ? 'CONNECTED'
                  : healthStatus === 'down'
                  ? 'OFFLINE / UNREACHABLE'
                  : 'CHECKING...'}
              </Text>
            </Text>
          </View>
          <View style={styles.gatewayInputRow}>
            <TextInput
              style={styles.gatewayInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://localhost:4100"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveUrlBtn} onPress={handleSaveServerUrl}>
              <Text style={styles.saveUrlBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cryptographic Hardening */}
        <Text style={styles.sectionHeader}>CRYPTOGRAPHIC HARDENING POSTURE</Text>
        <View style={styles.card}>
          <View style={styles.securityRow}>
            <View style={styles.securityIconBox}>
              <Database size={18} color="#06B6D4" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.securityItemTitle}>SQLCipher AES-256 Vault</Text>
              <Text style={styles.securityItemDesc}>
                Full database page encryption (4096-byte WAL) + FTS5 BM25 offline search.
              </Text>
            </View>
            <CheckCircle2 size={18} color="#10B981" />
          </View>

          <View style={styles.divider} />

          <View style={styles.securityRow}>
            <View style={styles.securityIconBox}>
              <Key size={18} color="#3B82F6" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.securityItemTitle}>Android Keystore Hardware Bound</Text>
              <Text style={styles.securityItemDesc}>
                Keys locked with WHEN_UNLOCKED_THIS_DEVICE_ONLY and lazy singleton unlock.
              </Text>
            </View>
            <CheckCircle2 size={18} color="#10B981" />
          </View>

          <View style={styles.divider} />

          <View style={styles.securityRow}>
            <View style={styles.securityIconBox}>
              <Lock size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.securityItemTitle}>15-Minute Rotating JWTs</Text>
              <Text style={styles.securityItemDesc}>
                Single-flight mutex across Axios REST and decoupled Copilot SSE streams.
              </Text>
            </View>
            <CheckCircle2 size={18} color="#10B981" />
          </View>
        </View>

        {/* Kill-Switch */}
        <Text style={styles.sectionHeader}>MNPI KILL-SWITCH / REMOTE WIPE</Text>
        <View style={[styles.card, styles.killSwitchCard]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <AlertOctagon size={20} color="#F43F5E" style={{ marginRight: 8 }} />
            <Text style={styles.killSwitchTitle}>Cryptographic Emergency Wipe</Text>
          </View>
          <Text style={styles.killSwitchDesc}>
            Shreds the encrypted SQLCipher vault, deletes Android Keystore keys, and clears MMKV state.
          </Text>

          <TouchableOpacity
            style={styles.killSwitchBtn}
            onPress={handleSimulateRemoteWipe}
            disabled={wiping}
          >
            <Trash2 size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.killSwitchBtnText}>Simulate Emergency MNPI Wipe</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={16} color="#94A3B8" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Sign Out from Device</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Invite Team Member Modal */}
      <Modal
        visible={inviteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provision Firm Member</Text>
              <TouchableOpacity onPress={() => setInviteOpen(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Jane Doe, VP M&A"
              placeholderTextColor="#64748B"
              value={invName}
              onChangeText={setInvName}
            />

            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              placeholder="jane@firm.com"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              keyboardType="email-address"
              value={invEmail}
              onChangeText={setInvEmail}
            />

            <Text style={styles.label}>INITIAL PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="Minimum 6 characters"
              placeholderTextColor="#64748B"
              secureTextEntry
              value={invPassword}
              onChangeText={setInvPassword}
            />

            {groups.length > 0 && (
              <>
                <Text style={styles.label}>ROLE GROUP</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {groups.map((g) => {
                    const gId = g.id || (g as any)._id;
                    const active = invGroupId === gId;
                    return (
                      <TouchableOpacity
                        key={gId}
                        style={[styles.groupChip, active && styles.groupChipActive]}
                        onPress={() => setInvGroupId(gId)}
                      >
                        <Text style={[styles.groupChipText, active && { color: '#67E8F9' }]}>
                          {g.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <TouchableOpacity
              style={styles.createMemberBtn}
              onPress={handleInviteUser}
              disabled={inviting}
            >
              {inviting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.createMemberText}>Create Team Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#0E131F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 18,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#06B6D4',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userEmail: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  userOrg: {
    fontSize: 11,
    color: '#06B6D4',
    fontWeight: '600',
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6,182,212,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  inviteBtnText: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyTeamText: {
    fontSize: 12,
    color: '#94A3B8',
    flex: 1,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  teamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  teamEmail: {
    fontSize: 11,
    color: '#94A3B8',
  },
  rolePill: {
    backgroundColor: 'rgba(59,130,246,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rolePillText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
  },
  gatewayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  gatewayStatusText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  gatewayInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gatewayInput: {
    flex: 1,
    backgroundColor: '#182032',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#FFFFFF',
    fontSize: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  saveUrlBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveUrlBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  securityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  securityItemDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  killSwitchCard: {
    borderColor: 'rgba(244, 63, 94, 0.3)',
    backgroundColor: '#130C14',
  },
  killSwitchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FB7185',
  },
  killSwitchDesc: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 18,
    marginBottom: 14,
  },
  killSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9F1239',
    paddingVertical: 12,
    borderRadius: 8,
  },
  killSwitchBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  logoutBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0E131F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.7,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#182032',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  groupChip: {
    backgroundColor: '#182032',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  groupChipActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
  },
  groupChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  createMemberBtn: {
    backgroundColor: '#0891B2',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  createMemberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
