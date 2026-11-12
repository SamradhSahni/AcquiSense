import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Search,
  X,
  PlusCircle,
  Briefcase,
  CheckSquare,
  FileText,
  Activity,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react-native';
import { getEncryptedDb } from '../../db/client';
import { useDealStore } from '../../stores/useDealStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const CommandPaletteModal: React.FC<Props> = ({ visible, onClose }) => {
  const router = useRouter();
  const { setSelectedDeal, setActiveTab } = useDealStore();
  const [query, setQuery] = useState('');
  const [deals, setDeals] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    try {
      const { sqlite } = getEncryptedDb();
      const dealRows = sqlite.getAllSync<any>(`SELECT * FROM deals ORDER BY updated_at DESC LIMIT 20`);
      setDeals(dealRows || []);
      const findingRows = sqlite.getAllSync<any>(
        `SELECT * FROM findings ORDER BY CASE severity WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 ELSE 3 END LIMIT 40`
      );
      setFindings(findingRows || []);
    } catch {
      // ignore if vault not unlocked yet
    }
  }, [visible]);

  if (!visible) return null;

  const q = query.trim().toLowerCase();

  const quickActions = [
    {
      id: 'new_deal',
      label: 'Initialize New Deal Vault',
      sub: '3-step wizard: Deal setup, VDR upload, deploy 13 agents',
      icon: PlusCircle,
      color: '#06B6D4',
      onPress: () => {
        onClose();
        router.push('/(tabs)/new-deal');
      },
    },
    {
      id: 'action_center',
      label: 'Open Risk Action Center',
      sub: 'Assign tasks, transition workflow states, upload VDR docs',
      icon: CheckSquare,
      color: '#F59E0B',
      onPress: () => {
        onClose();
        router.push('/(tabs)/action-center');
      },
    },
    {
      id: 'reports',
      label: 'Forensic Audit Reports Archive',
      sub: 'View archived Investment Committee memos & verdict seals',
      icon: FileText,
      color: '#10B981',
      onPress: () => {
        onClose();
        router.push('/(tabs)/reports');
      },
    },
    {
      id: 'telemetry',
      label: 'Live Multi-Agent Telemetry',
      sub: 'Monitor 9 specialist agents & BullMQ / FastAPI health',
      icon: Activity,
      color: '#3B82F6',
      onPress: () => {
        onClose();
        router.push('/(tabs)/telemetry');
      },
    },
    {
      id: 'settings',
      label: 'Team, Server & Zero-Trust Security',
      sub: 'Manage analysts, server URL, SQLCipher vault, remote wipe',
      icon: ShieldCheck,
      color: '#A78BFA',
      onPress: () => {
        onClose();
        router.push('/(tabs)/settings');
      },
    },
  ].filter((a) => !q || a.label.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q));

  const matchedDeals = deals
    .filter(
      (d) =>
        !q ||
        (d.name || '').toLowerCase().includes(q) ||
        (d.target_company || '').toLowerCase().includes(q)
    )
    .slice(0, 5);

  const matchedFindings = q
    ? findings
        .filter(
          (f) =>
            (f.title || '').toLowerCase().includes(q) ||
            (f.domain || '').toLowerCase().includes(q) ||
            (f.severity || '').toLowerCase().includes(q)
        )
        .slice(0, 6)
    : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.searchBar}>
            <Search size={18} color="#06B6D4" style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              placeholder="Jump to deals, findings, or commands..."
              placeholderTextColor="#64748B"
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.results}>
            {quickActions.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>QUICK COMMANDS</Text>
                {quickActions.map((act) => {
                  const Icon = act.icon;
                  return (
                    <TouchableOpacity key={act.id} style={styles.row} onPress={act.onPress}>
                      <View style={[styles.iconBox, { borderColor: act.color }]}>
                        <Icon size={16} color={act.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{act.label}</Text>
                        <Text style={styles.rowSub}>{act.sub}</Text>
                      </View>
                      <ArrowRight size={14} color="#64748B" />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {matchedDeals.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>DEAL VAULTS ({matchedDeals.length})</Text>
                {matchedDeals.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.row}
                    onPress={() => {
                      setSelectedDeal({
                        id: d.id,
                        name: d.name,
                        targetCompany: d.target_company,
                        acquirer: d.acquirer,
                        modelProfile: d.model_profile,
                        status: d.status,
                        goNoGo: d.go_no_go,
                        overallRiskScore: d.overall_risk_score,
                        totalFindings: d.total_findings,
                        latestJobId: d.latest_job_id,
                        updatedAt: d.updated_at,
                      });
                      setActiveTab('verdict');
                      onClose();
                      router.push(`/deal/${d.id}`);
                    }}
                  >
                    <View style={styles.iconBox}>
                      <Briefcase size={16} color="#60A5FA" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{d.name}</Text>
                      <Text style={styles.rowSub}>
                        {d.target_company || 'Target'} • {d.go_no_go || d.status}
                      </Text>
                    </View>
                    <ArrowRight size={14} color="#64748B" />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {matchedFindings.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>MATCHING FINDINGS ({matchedFindings.length})</Text>
                {matchedFindings.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={styles.row}
                    onPress={() => {
                      setActiveTab('findings');
                      onClose();
                      router.push(`/deal/${f.deal_id}`);
                    }}
                  >
                    <View style={[styles.sevTag]}>
                      <Text style={styles.sevText}>{f.severity}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {f.title}
                      </Text>
                      <Text style={styles.rowSub}>{String(f.domain).toUpperCase()}</Text>
                    </View>
                    <ArrowRight size={14} color="#64748B" />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  panel: {
    backgroundColor: '#0E131F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    maxHeight: '78%',
    overflow: 'hidden',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  results: {
    padding: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sevTag: {
    backgroundColor: 'rgba(244, 63, 94, 0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 10,
  },
  sevText: {
    color: '#FB7185',
    fontSize: 11,
    fontWeight: '800',
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  rowSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
});
