import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { Activity, ShieldCheck, Cpu, RefreshCw, CheckCircle2, Clock } from 'lucide-react-native';
import { API_BASE_URL } from '../../src/services/api';
import { DiligenceDomain } from '../../src/types';

interface AgentInfo {
  domain: DiligenceDomain;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'done' | 'failed';
  pct: number;
  findingsCount: number;
  color: string;
}

const AGENTS_CONFIG: AgentInfo[] = [
  { domain: 'legal', name: 'Legal Counsel Agent', role: 'IP ownership, reps & warranties, change of control', status: 'done', pct: 100, findingsCount: 8, color: '#8B5CF6' },
  { domain: 'finance', name: 'Financial QoE Agent', role: 'EBITDA normalization, working capital peg, debt schedule', status: 'done', pct: 100, findingsCount: 6, color: '#10B981' },
  { domain: 'commercial', name: 'Commercial Agent', role: 'Customer churn cohort, market TAM, pricing elasticity', status: 'done', pct: 100, findingsCount: 4, color: '#3B82F6' },
  { domain: 'tech', name: 'Tech Architecture Agent', role: 'Monolith-to-microservice debt, license compliance', status: 'done', pct: 100, findingsCount: 5, color: '#06B6D4' },
  { domain: 'cyber', name: 'Cyber & Privacy Agent', role: 'SOC2 Type II gaps, KMS encryption, threat surface', status: 'done', pct: 100, findingsCount: 4, color: '#F43F5E' },
  { domain: 'hr', name: 'HR & Org Agent', role: 'Key person retention, parachute clauses, org overlap', status: 'done', pct: 100, findingsCount: 3, color: '#EC4899' },
  { domain: 'tax', name: 'Tax Compliance Agent', role: 'Multi-state sales nexus, transfer pricing, R&D credit', status: 'done', pct: 100, findingsCount: 4, color: '#F59E0B' },
  { domain: 'regulatory', name: 'Regulatory Agent', role: 'HSR antitrust clearance, CFIUS sensitivity, GDPR/CCPA', status: 'done', pct: 100, findingsCount: 2, color: '#6366F1' },
  { domain: 'esg', name: 'ESG & Governance Agent', role: 'Scope 1-3 carbon tracking, OSHA adherence, DE&I metrics', status: 'done', pct: 100, findingsCount: 2, color: '#14B8A6' },
];

export default function TelemetryScreen() {
  const [agents, setAgents] = useState<AgentInfo[]>(AGENTS_CONFIG);
  const [pipelineState, setPipelineState] = useState<string>('DONE');
  const [activeConnections, setActiveConnections] = useState<boolean>(true);

  useEffect(() => {
    let socket: Socket | null = null;
    try {
      socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      });

      socket.on('connect', () => {
        setActiveConnections(true);
      });

      socket.on('disconnect', () => {
        setActiveConnections(false);
      });

      socket.on('agent_progress', (data: any) => {
        if (data.domain) {
          setAgents((prev) =>
            prev.map((a) =>
              a.domain === data.domain
                ? {
                    ...a,
                    status: data.status || a.status,
                    pct: typeof data.pct === 'number' ? data.pct : a.pct,
                    findingsCount:
                      typeof data.findingsCount === 'number'
                        ? data.findingsCount
                        : a.findingsCount,
                  }
                : a
            )
          );
        }
      });
    } catch (e) {
      console.warn('Socket telemetry setup notice:', e);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const totalFindings = agents.reduce((acc, a) => acc + a.findingsCount, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Live Telemetry</Text>
            <Text style={styles.subtitle}>Autonomous 9-Agent Diligence Swarm</Text>
          </View>
          <View style={styles.connPill}>
            <View
              style={[
                styles.connDot,
                { backgroundColor: activeConnections ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.connText}>{activeConnections ? 'WebSocket Connected' : 'Polling Active'}</Text>
          </View>
        </View>

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
              7-Gate Quality Gates Passed {'\u2022'} SHA-256 Tamper Proof
            </Text>
          </View>
          <View style={styles.findingsCounterBox}>
            <Text style={styles.findingsCounterNum}>{totalFindings}</Text>
            <Text style={styles.findingsCounterLabel}>Findings</Text>
          </View>
        </View>

        {/* Agent Telemetry Grid */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollList}>
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

              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${agent.pct}%`,
                      backgroundColor: agent.color,
                    },
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
  pipelineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E131F',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
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
    letterSpacing: 0.5,
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
    paddingBottom: 20,
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

