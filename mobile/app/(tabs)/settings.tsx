import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ShieldCheck,
  Key,
  Database,
  Lock,
  Trash2,
  LogOut,
  AlertOctagon,
  CheckCircle2,
} from 'lucide-react-native';
import { executeEmergencyMnpiWipe } from '../../src/db/client';
import { useAuthStore } from '../../src/stores/useAuthStore';

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [wiping, setWiping] = useState(false);

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
                [
                  {
                    text: 'OK',
                    onPress: () => router.replace('/(auth)/login'),
                  },
                ]
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Enterprise Security</Text>
          <Text style={styles.subtitle}>v3.0 Zero-Trust Device Hardening</Text>
        </View>

        {/* User / Organization Profile Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'A'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.userName}>{user?.name || 'Institutional Analyst'}</Text>
              <Text style={styles.userEmail}>{user?.email || 'analyst@acquisense.io'}</Text>
              <Text style={styles.userOrg}>{user?.company?.name || 'Global Horizons PE'}</Text>
            </View>
          </View>
        </View>

        {/* Defense-in-Depth Status */}
        <Text style={styles.sectionHeader}>CRYPTOGRAPHIC HARDENING POSTURE</Text>
        <View style={styles.card}>
          <View style={styles.securityRow}>
            <View style={styles.securityIconBox}>
              <Database size={18} color="#06B6D4" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.securityItemTitle}>SQLCipher AES-256 Vault</Text>
              <Text style={styles.securityItemDesc}>
                Full database page encryption (4096-byte WAL). PRAGMA raw hex key protection.
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
                Keys are locked with WHEN_UNLOCKED_THIS_DEVICE_ONLY; lazy init prevents background crashes.
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
                Single-flight mutex prevents duplicate refresh race conditions across Axios & SSE.
              </Text>
            </View>
            <CheckCircle2 size={18} color="#10B981" />
          </View>
        </View>

        {/* Emergency Kill Switch Section */}
        <Text style={styles.sectionHeader}>MNPI KILL-SWITCH / REMOTE WIPE</Text>
        <View style={[styles.card, styles.killSwitchCard]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <AlertOctagon size={20} color="#F43F5E" style={{ marginRight: 8 }} />
            <Text style={styles.killSwitchTitle}>Cryptographic Emergency Wipe</Text>
          </View>
          <Text style={styles.killSwitchDesc}>
            If this device is lost, stolen, or decommissioned, an administrator signals an instant
            remote wipe via high-priority silent FCM. You can test the wipe mechanism locally below.
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

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={16} color="#94A3B8" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Sign Out from Device</Text>
        </TouchableOpacity>
      </ScrollView>
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
    marginBottom: 20,
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
  card: {
    backgroundColor: '#0E131F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 20,
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
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
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
    marginBottom: 16,
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
});
