import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  Building2,
  UploadCloud,
  Rocket,
  Check,
  FileText,
  Trash2,
  Zap,
  Cpu,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react-native';
import { ModelProfile } from '../../src/types';
import { PickedDocument, createDeal, startJob, uploadVdrFiles } from '../../src/services/webApi';
import { uploadLargeVdrDocumentResumable } from '../../src/services/multipartUploader';
import { useDealStore } from '../../src/stores/useDealStore';

const STEPS = ['01 Deal Setup', '02 VDR Upload', '03 Deploy AI'];

const MODEL_PROFILES: Array<{
  value: ModelProfile;
  label: string;
  tag: string;
  desc: string;
  icon: any;
}> = [
  {
    value: 'economy',
    label: 'Economy Tier',
    tag: 'Fastest • Low Latency',
    desc: 'GPT-4o-mini across all 9 domain agents. Optimized for rapid screening.',
    icon: Zap,
  },
  {
    value: 'standard',
    label: 'Standard Tier',
    tag: 'Recommended • Balanced',
    desc: 'GPT-4o-mini domain agents with GPT-4o synthesis & quality verification gates.',
    icon: Cpu,
  },
  {
    value: 'premium',
    label: 'Deep Forensic Tier',
    tag: 'Highest Depth • IC Ready',
    desc: 'GPT-4o across all domain specialists & cross-domain synthesis.',
    icon: Sparkles,
  },
];

const CHUNKED_THRESHOLD_BYTES = 15 * 1024 * 1024;

export default function NewDealWizardScreen() {
  const router = useRouter();
  const { setSelectedDeal, setActiveTab } = useDealStore();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [targetCompany, setTargetCompany] = useState('');
  const [acquirer, setAcquirer] = useState('');
  const [modelProfile, setModelProfile] = useState<ModelProfile>('standard');

  const [dealId, setDealId] = useState<string | null>(null);
  const [files, setFiles] = useState<PickedDocument[]>([]);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [launching, setLaunching] = useState(false);

  const resetWizard = () => {
    setStep(0);
    setName('');
    setTargetCompany('');
    setAcquirer('');
    setModelProfile('standard');
    setDealId(null);
    setFiles([]);
    setSavedNames([]);
    setUploadPct(0);
  };

  const handleStep1 = async () => {
    if (!name.trim()) {
      Alert.alert('Deal Name Required', 'Enter a deal code or project name to initialize the vault.');
      return;
    }
    setCreating(true);
    try {
      const created = await createDeal({
        name: name.trim(),
        targetCompany: targetCompany.trim(),
        acquirer: acquirer.trim(),
        modelProfile,
      });
      setDealId(created._id || created.id);
      setStep(1);
    } catch (err: any) {
      Alert.alert(
        'Deal Creation Failed',
        err?.response?.data?.error || err?.message || 'Unable to create deal on server.'
      );
    } finally {
      setCreating(false);
    }
  };

  const pickFiles = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: '*/*',
      });
      if (!res.canceled && res.assets?.length) {
        setFiles((prev) => {
          const existing = new Set(prev.map((p) => p.name));
          const additions: PickedDocument[] = res.assets
            .filter((a) => !existing.has(a.name))
            .map((a) => ({
              uri: a.uri,
              name: a.name,
              mimeType: a.mimeType || 'application/octet-stream',
              size: a.size,
            }));
          return [...prev, ...additions];
        });
      }
    } catch (err: any) {
      Alert.alert('Picker Error', err?.message || 'Unable to access files.');
    }
  };

  const handleStep2Upload = async () => {
    if (!dealId) return;
    if (files.length === 0) {
      Alert.alert('No Files Selected', 'Pick at least one VDR document (PDF, DOCX, XLSX, CSV).');
      return;
    }

    setUploading(true);
    setUploadPct(10);
    try {
      const smallFiles = files.filter((f) => !f.size || f.size <= CHUNKED_THRESHOLD_BYTES);
      const largeFiles = files.filter((f) => f.size && f.size > CHUNKED_THRESHOLD_BYTES);
      const collected: string[] = [];

      if (smallFiles.length > 0) {
        const result = await uploadVdrFiles(smallFiles, dealId, (pct) =>
          setUploadPct(Math.max(15, Math.round(pct)))
        );
        if (Array.isArray(result.savedNames)) {
          collected.push(...result.savedNames);
        }
      }

      for (const lf of largeFiles) {
        const key = await uploadLargeVdrDocumentResumable({
          dealId,
          fileUri: lf.uri,
          fileName: lf.name,
          mimeType: lf.mimeType || 'application/pdf',
          onProgress: (pct) => setUploadPct(pct),
        });
        const saved = key.split('/').pop();
        if (saved) collected.push(saved);
      }

      setSavedNames(collected);
      setStep(2);
    } catch (err: any) {
      Alert.alert('VDR Upload Error', err?.response?.data?.error || err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleStep3Launch = async () => {
    if (!dealId) return;
    setLaunching(true);
    try {
      const job = await startJob(dealId, savedNames, modelProfile);
      setSelectedDeal({
        id: dealId,
        name: name.trim(),
        targetCompany: targetCompany.trim(),
        acquirer: acquirer.trim(),
        modelProfile,
        status: 'analyzing',
        goNoGo: null,
        overallRiskScore: 0,
        totalFindings: 0,
        latestJobId: job.jobId,
        latestPythonJobId: job.pythonJobId,
        updatedAt: new Date().toISOString(),
      });
      setActiveTab('agents');
      const targetId = dealId;
      resetWizard();
      router.push(`/deal/${targetId}`);
    } catch (err: any) {
      Alert.alert('Launch Failed', err?.response?.data?.error || err?.message || 'Unable to start AI job.');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Initialize Diligence Vault</Text>
          <Text style={styles.subtitle}>
            Configure acquisition parameters, ingest VDR docs & launch 13 AI agents
          </Text>
        </View>

        {/* Stepper */}
        <View style={styles.stepper}>
          {STEPS.map((label, idx) => {
            const done = idx < step;
            const active = idx === step;
            return (
              <View
                key={label}
                style={[
                  styles.stepPill,
                  active && styles.stepPillActive,
                  done && styles.stepPillDone,
                ]}
              >
                {done && <Check size={12} color="#10B981" style={{ marginRight: 4 }} />}
                <Text
                  style={[
                    styles.stepText,
                    active && styles.stepTextActive,
                    done && styles.stepTextDone,
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Step 0: Deal Setup */}
        {step === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Step 01 • Acquisition Parameters</Text>

            <Text style={styles.label}>DEAL CODE / PROJECT NAME *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Project Phoenix / Acme SaaS"
              placeholderTextColor="#64748B"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>TARGET COMPANY</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. CloudScale Systems, Inc."
              placeholderTextColor="#64748B"
              value={targetCompany}
              onChangeText={setTargetCompany}
            />

            <Text style={styles.label}>ACQUIRING ENTITY / SPONSOR</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Apex Strategic Growth Fund II"
              placeholderTextColor="#64748B"
              value={acquirer}
              onChangeText={setAcquirer}
            />

            <Text style={styles.label}>AUTONOMOUS AI COMPUTE TIER</Text>
            {MODEL_PROFILES.map((p) => {
              const Icon = p.icon;
              const selected = modelProfile === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.profileCard, selected && styles.profileCardActive]}
                  onPress={() => setModelProfile(p.value)}
                >
                  <View style={styles.profileTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Icon size={16} color={selected ? '#06B6D4' : '#94A3B8'} />
                      <Text style={styles.profileLabel}>{p.label}</Text>
                    </View>
                    <Text style={styles.profileTag}>{p.tag}</Text>
                  </View>
                  <Text style={styles.profileDesc}>{p.desc}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.primaryBtn, creating && { opacity: 0.6 }]}
              onPress={handleStep1}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Continue to VDR Ingestion</Text>
                  <ArrowRight size={17} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Step 1: VDR Upload */}
        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Step 02 • Virtual Data Room Upload</Text>
            <Text style={styles.cardSub}>
              Vault ID: {dealId} • Select target PDFs, financial spreadsheets, contracts, or memos.
            </Text>

            <TouchableOpacity style={styles.dropZone} onPress={pickFiles} disabled={uploading}>
              <UploadCloud size={32} color="#06B6D4" />
              <Text style={styles.dropTitle}>Tap to Pick VDR Documents</Text>
              <Text style={styles.dropSub}>PDF, DOCX, XLSX, PPTX, CSV, TXT, MD (up to 50MB+)</Text>
            </TouchableOpacity>

            {files.map((f) => (
              <View key={f.name} style={styles.fileRow}>
                <FileText size={16} color="#60A5FA" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {f.size ? (
                    <Text style={styles.fileSize}>{(f.size / (1024 * 1024)).toFixed(2)} MB</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                  disabled={uploading}
                >
                  <Trash2 size={16} color="#F43F5E" />
                </TouchableOpacity>
              </View>
            ))}

            {uploading && (
              <View style={{ marginVertical: 12 }}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${uploadPct}%` }]} />
                </View>
                <Text style={styles.progressText}>Uploading & Validating Magic Bytes... {uploadPct}%</Text>
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setStep(0)}
                disabled={uploading}
              >
                <ArrowLeft size={16} color="#94A3B8" />
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1, marginTop: 0 }, uploading && { opacity: 0.6 }]}
                onPress={handleStep2Upload}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>Ingest {files.length} Doc(s)</Text>
                    <ArrowRight size={17} color="#FFFFFF" style={{ marginLeft: 8 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2: Deploy 13 AI Agents */}
        {step === 2 && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <ShieldCheck size={20} color="#10B981" style={{ marginRight: 8 }} />
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Step 03 • Ready to Deploy AI Swarm</Text>
            </View>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryRow}>
                Deal: <Text style={styles.summaryVal}>{name}</Text>
              </Text>
              <Text style={styles.summaryRow}>
                Target: <Text style={styles.summaryVal}>{targetCompany || 'Confidential'}</Text>
              </Text>
              <Text style={styles.summaryRow}>
                Compute Profile: <Text style={styles.summaryVal}>{modelProfile.toUpperCase()}</Text>
              </Text>
              <Text style={styles.summaryRow}>
                Documents Ingested: <Text style={styles.summaryVal}>{savedNames.length} file(s)</Text>
              </Text>
            </View>

            <Text style={styles.swarmNote}>
              9 domain specialist agents (Legal, Finance, Commercial, Tech, Cyber, HR, Tax, Regulatory, ESG) + Cross-Domain Synthesis, Quality Gate, Questions, and Report Generator will execute in parallel.
            </Text>

            <TouchableOpacity
              style={[styles.launchBtn, launching && { opacity: 0.6 }]}
              onPress={handleStep3Launch}
              disabled={launching}
            >
              {launching ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Rocket size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryBtnText}>Deploy 13 Forensic AI Agents</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
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
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  stepPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E131F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 8,
  },
  stepPillActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
  },
  stepPillDone: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  stepText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stepTextActive: {
    color: '#67E8F9',
  },
  stepTextDone: {
    color: '#34D399',
  },
  card: {
    backgroundColor: '#0E131F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  cardSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#182032',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  profileCard: {
    backgroundColor: '#182032',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    marginBottom: 8,
  },
  profileCardActive: {
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  profileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
    marginLeft: 8,
  },
  profileTag: {
    fontSize: 10,
    color: '#06B6D4',
    fontWeight: '600',
  },
  profileDesc: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 18,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(6,182,212,0.45)',
    backgroundColor: 'rgba(6,182,212,0.05)',
    borderRadius: 12,
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  dropTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F1F5F9',
    marginTop: 8,
  },
  dropSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#182032',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  fileName: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '600',
  },
  fileSize: {
    color: '#64748B',
    fontSize: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#06B6D4',
  },
  progressText: {
    color: '#67E8F9',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#182032',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  secondaryBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  summaryBox: {
    backgroundColor: '#182032',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    gap: 6,
  },
  summaryRow: {
    fontSize: 12,
    color: '#94A3B8',
  },
  summaryVal: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  swarmNote: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 18,
  },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 15,
  },
});
