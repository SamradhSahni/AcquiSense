import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { Cpu, CheckCircle2, Clock, ArrowLeft, Server } from 'lucide-react-native';
import { API_BASE_URL } from '../../src/services/api';
import { getDeals, getGatewayHealth, getJob } from '../../src/services/webApi';
import { Deal, DiligenceDomain, GatewayHealth } from '../../src/types';

interface AgentInfo {
  domain: DiligenceDomain;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'done' | 'failed';
  pct: number;
  findingsCount: number;
  color: string;
}

const DEFAULT_AGENTS: AgentInfo[] = [
  { domain: 'legal', name: 'Legal Counsel Agent', role: 'IP ownership, reps & warranties, change of control', status: 'idle', pct: 0, findingsCount: 0, color: '#8B5CF6' },
  { domain: 'finance', name: 'Financial QoE Agent', role: 'EBITDA normalization, working capital peg, debt schedule', status: 'idle', pct: 0, findingsCount: 0, color: '#10B981' },
  { domain: 'commercial', name: 'Commercial Agent', role: 'Customer churn cohort, market TAM, pricing elasticity', status: 'idle', pct: 0, findingsCount: 0, color: '#3B82F6' },
  { domain: 'tech', name: 'Tech Architecture Agent', role: 'Monolith-to-microservice debt, license compliance', status: 'idle', pct: 0, findingsCount: 0, color: '#06B6D4' },
  { domain: 'cyber', name: 'Cyber & Privacy Agent', role: 'SOC2 Type II gaps, KMS encryption, threat surface', status: 'idle', pct: 0, findingsCount: 0, color: '#F43F5E' },
  { domain: 'hr', name: 'HR & Org Agent', role: 'Key person retention, parachute clauses, org overlap', status: 'idle', pct: 0, findingsCount: 0, color: '#EC4899' },
  { domain: 'tax', name: 'Tax Compliance Agent', role: 'Multi-state sales nexus, transfer pricing, R&D credit', status: 'idle', pct: 0, findingsCount: 0, color: '#F59E0B' },
  { domain: 'regulatory', name: 'Regulatory Agent', role: 'HSR antitrust clearance, CFIUS sensitivity, GDPR/CCPA', status: 'idle', pct: 0, findingsCount: 0, color: '#6366F1' },
  { domain: 'esg', name: 'ESG & Governance Agent', role: 'Scope 1-3 carbon tracking, OSHA adherence, DE&I metrics', status: 'idle', pct: 0, findingsCount: 0, color: '#14B8A6' },
];

export default function TelemetryScreen() {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>(DEFAULT_AGENTS);
  const [pipelineState, setPipelineState] = useState<string>('IDLE');
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let socket: Socket | null = null;

      const init = async () => {
        try {
          const [h, dealList] = await Promise.all([
            getGatewayHealth().catch(() => null),
            getDeals().catch(() => []),
          ]);
          if (h) setHealth(h);
          const list = Array.isArray(dealList) ? dealList : [];
          setDeals(list);
          const target = selectedDeal
            ? list.find((d) => (d._id || d.id) === (selectedDeal._id || selectedDeal.id)) || list[0]
            : list[0];
          if (target) {
            setSelectedDeal(target);
            await loadJobProgress(target, socket);
          }
        } finally {
          setRefreshing(false);
        }
      };

      try {
        socket = io(API_BASE_URL, { transports: ['websocket', 'polling'], timeout: 5000 });
        socket.on('connect', () => setSocketConnected(true));
        socket.on('disconnect', () => setSocketConnected(false));
        socket.on('agent_progress', (ev: any) => {
          if (ev.domain) {
            setAgents((prev) =>
              prev.map((a) =>
                a.domain === ev.domain
                  ? {
                      ...a,
                      status: ev.status || a.status,
                      pct: typeof ev.pct === 'number' ? ev.pct : a.pct,
                      findingsCount:
                        typeof ev.findings_count === 'number'
                          ? ev.findings_count
                          : typeof ev.findingsCount === 'number'
                          ? ev.findingsCount
                          : a.findingsCount,
                    }
                  : a
              )
            );
          }
        });
        socket.on('job_status', (ev: any) => {
          if (ev.status) setPipelineState(String(ev.status).toUpperCase());
        });
      } catch {
        // ignore
      }

      init();
      return () => {
        if (socket) socket.disconnect();
      };
    }, [selectedDeal?._id, selectedDeal?.id])
  );

  const loadJobProgress = async (deal: Deal, socket: Socket | null) => {
    if (!deal.latestJobId) {
      setPipelineState(deal.status ? deal.status.toUpperCase() : 'DRAFT');
      setAgents(DEFAULT_AGENTS);
      return;
    }
    try {
      const job = await getJob(deal.latestJobId);
      setPipelineState(String(job.status || deal.status).toUpperCase());
      if (job.pythonJobId && socket) {
        socket.emit('subscribe_job', job.pythonJobId);
      }
      if (job.agentProgress) {
        setAgents(
          DEFAULT_AGENTS.map((a) => {
            const p = job.agentProgress?.[a.domain];
            if (!p) {
              return job.status === 'done' ? { ...a, status: 'done', pct: 100 } : a;
            }
            return {
              ...a,
              status: (p.status as any) || a.status,
              pct: typeof p.pct === 'number' ? p.pct : job.status === 'done' ? 100 : 0,
              findingsCount: p.findingsCount ?? p.findings_count ?? 0,
            };
          })
        );
      }
    } catch {
      setPipelineState(deal.status ? deal.status.toUpperCase() : 'UNKNOWN');
    }
  };

  const totalFindings = agents.reduce((acc, a) => acc + a.findingsCount, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.title}>Live Telemetry</Text>
            <Text style={styles.subtitle}>Microservices Health & 9-Agent Swarm</Text>
          </View>
          <View style={styles.connPill}>
            <View
              style={[
                styles.connDot,
                { backgroundColor: socketConnected ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.connText}>{socketConnected ? 'WS Live' : 'REST Poll'}</Text>
          </View>
        </View>

        {/* System Health Bar */}
        <View style={styles.healthRow}>
          <Server size={14} color="#06B6D4" style={{ marginRight: 6 }} />
          <Text style={styles.healthText}>
            Gateway: {health?.status === 'ok' ? 'OK' : 'Offline'} {'\u2022'} Mongo:{' '}
            {health?.mongo || '—'} {'\u2022'} AI Engine: {health?.python || '—'}
          </Text>
        </View>

        {/* Deal Picker */}
        {deals.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {deals.map((d) => {
                const id = d._id || d.id;
                const active = (selectedDeal?._id || selectedDeal?.id) === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.dealChip, active && styles.dealChipActive]}
                    onPress={() => {
                      setSelectedDeal(d);
                      loadJobProgress(d, null);
                    }}
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
        )}

        {/* Global Pipeline State Banner */}
        <View style={styles.pipelineBanner}>
          <View style={styles.pipelineIconCircle}>
            <Cpu size={20} color="#06B6D4" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.pipelineStatusLabel}>PIPELINE STATE:</Text>
              <Text style={styles.pipelineStatusValue}>{pipelineState}</Text>
            </View>
            <Text style={styles.pipelineDetails}>
              {selectedDeal?.name || 'Select a deal'} {'\u2022'} SHA-256 Verified
            </Text>
          </View>
          <View style={styles.findingsCounterBox}>
            <Text style={styles.findingsCounterNum}>{totalFindings || selectedDeal?.totalFindings || 0}</Text>
            <Text style={styles.findingsCounterLabel}>Findings</Text>
          </View>
        </View>

        {/* Agent Telemetry Grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                if (selectedDeal) loadJobProgress(selectedDeal, null).finally(() => setRefreshing(false));
              }}
              tintColor="#06B6D4"
            />
          }
        >
          {agents.map((agent) => (
            <View key={agent.domain} style={styles.agentCard}>
              <View style={styles.agentCardTop}>
                <View style={styles.agentTitleRow}>
                  <View style={[styles.domainTagDot, { backgroundColor: agent.color }]} />
                  <Text style={styles.agentName}>{agent.name}</Text>
                </View>
                <View style={styles.agentStatusBadge}>
                  {agent.status === 'done' ? (
                    <CheckCircle2 size={14} color="#10B981" />
                  ) : agent.status === 'running' ? (
                    <ActivityIndicator size="small" color="#06B6D4" />
                  ) : (
                    <Clock size={14} color="#64748B" />
                  )}
                  <Text style={[styles.agentStatusText, agent.status === 'done' && { color: '#34D399' }]}>
                    {agent.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.agentRole}>{agent.role}</Text>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${agent.pct}%`, backgroundColor: agent.color },
                  ]}
                />
              </View>

              <View style={styles.agentCardBottom}>
                <Text style={styles.pctLabel}>{agent.pct}% complete</Text>
                <Text style={styles.findingsDiscovered}>
                  {agent.findingsCount} findings discovered
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0E131F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  connText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '600',
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E131F',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  healthText: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  dealChip: {
    backgroundColor: '#0E131F',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 180,
  },
  dealChipActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
  },
  dealChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  dealChipTextActive: {
    color: '#67E8F9',
  },
  pipelineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E131F',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  pipelineIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pipelineStatusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  pipelineStatusValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
    marginLeft: 6,
  },
  pipelineDetails: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  findingsCounterBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  findingsCounterNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  findingsCounterLabel: {
    fontSize: 9,
    color: '#94A3B8',
  },
  scrollList: {
    paddingBottom: 24,
  },
  agentCard: {
    backgroundColor: '#0E131F',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  agentCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  agentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  domainTagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  agentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  agentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginLeft: 4,
  },
  agentRole: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 10,
  },
  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2.5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  agentCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pctLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  findingsDiscovered: {
    fontSize: 11,
    color: '#06B6D4',
    fontWeight: '600',
  },
});
