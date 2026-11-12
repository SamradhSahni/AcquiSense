import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FileText,
  Building2,
  Calendar,
  ArrowRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
} from 'lucide-react-native';
import { GlowCard } from '../../src/components/ui/GlowCard';
import { getReports } from '../../src/services/webApi';
import { useDealStore } from '../../src/stores/useDealStore';
import { ReportRecord } from '../../src/types';

export default function ReportsArchiveScreen() {
  const router = useRouter();
  const { setActiveTab } = useDealStore();
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [])
  );

  const loadReports = async () => {
    try {
      const data = await getReports();
      setReports(Array.isArray(data) ? data : []);
    } catch {
      // Offline / unreachable
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const renderVerdictBadge = (goNoGo?: string) => {
    if (goNoGo === 'GO') {
      return (
        <View style={[styles.verdictPill, { backgroundColor: 'rgba(16,185,129,0.16)' }]}>
          <CheckCircle2 size={12} color="#10B981" />
          <Text style={[styles.verdictText, { color: '#34D399' }]}>GO</Text>
        </View>
      );
    }
    if (goNoGo === 'NO-GO') {
      return (
        <View style={[styles.verdictPill, { backgroundColor: 'rgba(244,63,94,0.16)' }]}>
          <OctagonAlert size={12} color="#F43F5E" />
          <Text style={[styles.verdictText, { color: '#FB7185' }]}>NO-GO</Text>
        </View>
      );
    }
    return (
      <View style={[styles.verdictPill, { backgroundColor: 'rgba(245,158,11,0.16)' }]}>
        <AlertTriangle size={12} color="#F59E0B" />
        <Text style={[styles.verdictText, { color: '#FBBF24' }]}>{goNoGo || 'CAUTION'}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Audit Dossiers</Text>
            <Text style={styles.subtitle}>Archived Investment Committee Memos</Text>
          </View>

          <TouchableOpacity
            style={styles.telemetryBtn}
            onPress={() => router.push('/(tabs)/telemetry')}
          >
            <Activity size={14} color="#06B6D4" />
            <Text style={styles.telemetryBtnText}>Telemetry</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#06B6D4" />
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.centered}>
            <FileText size={36} color="#334155" />
            <Text style={styles.emptyTitle}>No Compiled Reports Yet</Text>
            <Text style={styles.emptySub}>
              Complete an autonomous 13-agent diligence job to archive IC memorandums here.
            </Text>
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push('/(tabs)/new-deal')}
            >
              <Text style={styles.ctaBtnText}>Initialize Diligence Pipeline</Text>
              <ArrowRight size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) => item._id}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  loadReports();
                }}
                tintColor="#06B6D4"
              />
            }
            renderItem={({ item }) => {
              const dealObj = typeof item.dealId === 'object' ? item.dealId : null;
              const dealName = dealObj?.name || item.dealName || 'Unnamed Deal';
              const targetName = dealObj?.targetCompany || item.targetCompany || 'Confidential Target';
              const dealTargetId = dealObj?._id || (typeof item.dealId === 'string' ? item.dealId : '');
              const sev = item.severityDistribution || ({} as any);

              return (
                <TouchableOpacity
                  onPress={() => {
                    if (dealTargetId) {
                      setActiveTab('verdict');
                      router.push(`/deal/${dealTargetId}`);
                    }
                  }}
                >
                  <GlowCard decision={item.goNoGo}>
                    <View style={styles.cardTop}>
                      {renderVerdictBadge(item.goNoGo)}
                      <View style={styles.dateRow}>
                        <Calendar size={11} color="#64748B" />
                        <Text style={styles.dateText}>
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : ''}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.dealTitle}>{dealName}</Text>
                    <View style={styles.targetRow}>
                      <Building2 size={12} color="#94A3B8" />
                      <Text style={styles.targetText}>{targetName}</Text>
                    </View>

                    <Text style={styles.summaryText} numberOfLines={3}>
                      {item.executiveSummary ||
                        'Forensic synthesis across 9 diligence domains compiled and verified by quality gates.'}
                    </Text>

                    <View style={styles.footer}>
                      <View style={styles.sevRow}>
                        <Text style={[styles.sevPill, { color: '#FB7185' }]}>P0: {sev.P0 || 0}</Text>
                        <Text style={[styles.sevPill, { color: '#FBBF24' }]}>P1: {sev.P1 || 0}</Text>
                        <Text style={[styles.sevPill, { color: '#60A5FA' }]}>P2: {sev.P2 || 0}</Text>
                        <Text style={[styles.sevPill, { color: '#34D399' }]}>P3: {sev.P3 || 0}</Text>
                      </View>
                      <View style={styles.openLink}>
                        <Text style={styles.openLinkText}>Open Dossier</Text>
                        <ArrowRight size={13} color="#06B6D4" />
                      </View>
                    </View>
                  </GlowCard>
                </TouchableOpacity>
              );
            }}
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
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  telemetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6,182,212,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
  },
  telemetryBtnText: {
    color: '#67E8F9',
    fontSize: 12,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0891B2',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 9,
    marginTop: 18,
    gap: 8,
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  verdictPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  verdictText: {
    fontSize: 11,
    fontWeight: '800',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateText: {
    color: '#64748B',
    fontSize: 11,
  },
  dealTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  targetText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  summaryText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sevRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sevPill: {
    fontSize: 11,
    fontWeight: '700',
  },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openLinkText: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '700',
  },
});
