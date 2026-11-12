import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { UploadCloud, FileText, X, Rocket, CheckCircle2, Trash2 } from 'lucide-react-native';
import { Deal, ModelProfile } from '../../types';
import { PickedDocument, getDeals, startJob, uploadVdrFiles } from '../../services/webApi';
import { uploadLargeVdrDocumentResumable } from '../../services/multipartUploader';

interface Props {
  visible: boolean;
  initialDealId?: string | null;
  onClose: () => void;
  onUploaded?: (dealId: string, savedNames: string[], startedJob?: boolean) => void;
}

const CHUNKED_THRESHOLD_BYTES = 15 * 1024 * 1024; // Use resumable 5MB chunking for >15MB files

export const VdrUploadModal: React.FC<Props> = ({
  visible,
  initialDealId,
  onClose,
  onUploaded,
}) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>(initialDealId || '');
  const [files, setFiles] = useState<PickedDocument[]>([]);
  const [runAgentsAfter, setRunAgentsAfter] = useState<boolean>(true);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    if (visible) {
      setFiles([]);
      setProgressPct(0);
      if (initialDealId) {
        setSelectedDealId(initialDealId);
      }
      getDeals()
        .then((list) => {
          const arr = Array.isArray(list) ? list : [];
          setDeals(arr);
          if (!initialDealId && arr.length > 0) {
            setSelectedDealId(arr[0]._id || arr[0].id);
          }
        })
        .catch(() => {});
    }
  }, [visible, initialDealId]);

  if (!visible) return null;

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
          'text/csv',
          'text/markdown',
          '*/*',
        ],
      });

      if (!result.canceled && result.assets?.length) {
        setFiles((prev) => {
          const existing = new Set(prev.map((p) => p.name));
          const additions: PickedDocument[] = result.assets
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
      Alert.alert('File Picker Error', err?.message || 'Unable to select files.');
    }
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleUpload = async () => {
    if (!selectedDealId) {
      Alert.alert('Deal Required', 'Please select a target deal vault first.');
      return;
    }
    if (files.length === 0) {
      Alert.alert('No Files Selected', 'Select at least one VDR document to upload.');
      return;
    }

    setUploading(true);
    setProgressPct(5);
    try {
      const smallFiles = files.filter((f) => !f.size || f.size <= CHUNKED_THRESHOLD_BYTES);
      const largeFiles = files.filter((f) => f.size && f.size > CHUNKED_THRESHOLD_BYTES);
      const savedNames: string[] = [];

      if (smallFiles.length > 0) {
        const res = await uploadVdrFiles(smallFiles, selectedDealId, (pct) =>
          setProgressPct(Math.max(10, Math.round(pct * (largeFiles.length ? 0.6 : 1))))
        );
        if (Array.isArray(res.savedNames)) {
          savedNames.push(...res.savedNames);
        }
      }

      for (const lf of largeFiles) {
        const objectKey = await uploadLargeVdrDocumentResumable({
          dealId: selectedDealId,
          fileUri: lf.uri,
          fileName: lf.name,
          mimeType: lf.mimeType || 'application/pdf',
          onProgress: (pct) => setProgressPct(60 + Math.round(pct * 0.4)),
        });
        const basename = objectKey.split('/').pop();
        if (basename) savedNames.push(basename);
      }

      let startedJob = false;
      if (runAgentsAfter && savedNames.length > 0) {
        const targetDeal = deals.find((d) => (d._id || d.id) === selectedDealId);
        const profile: ModelProfile = targetDeal?.modelProfile || 'standard';
        await startJob(selectedDealId, savedNames, profile);
        startedJob = true;
      }

      Alert.alert(
        'VDR Ingestion Complete',
        startedJob
          ? `${files.length} document(s) uploaded and 13 forensic AI agents dispatched.`
          : `${files.length} document(s) securely uploaded to Deal Vault.`
      );
      onUploaded?.(selectedDealId, savedNames, startedJob);
      onClose();
    } catch (err: any) {
      Alert.alert(
        'Upload Failed',
        err?.response?.data?.error || err?.message || 'Verify server connectivity on port 4100.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <UploadCloud size={20} color="#06B6D4" style={{ marginRight: 8 }} />
              <Text style={styles.title}>Upload VDR Documents</Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={uploading}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {!initialDealId && deals.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.label}>TARGET DEAL VAULT</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {deals.map((d) => {
                    const id = d._id || d.id;
                    const active = id === selectedDealId;
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
            )}

            <TouchableOpacity style={styles.dropZone} onPress={pickDocuments} disabled={uploading}>
              <UploadCloud size={30} color="#06B6D4" />
              <Text style={styles.dropTitle}>Tap to Select Data Room Files</Text>
              <Text style={styles.dropSub}>
                Supports PDF, DOCX, XLSX, PPTX, CSV, TXT, MD (Chunked resume for 15MB+)
              </Text>
            </TouchableOpacity>

            {files.length > 0 && (
              <View style={styles.fileList}>
                <Text style={styles.label}>SELECTED DOCUMENTS ({files.length})</Text>
                {files.map((f) => (
                  <View key={f.name} style={styles.fileRow}>
                    <FileText size={16} color="#60A5FA" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {f.name}
                      </Text>
                      {f.size ? (
                        <Text style={styles.fileSize}>
                          {(f.size / (1024 * 1024)).toFixed(2)} MB
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => removeFile(f.name)} disabled={uploading}>
                      <Trash2 size={16} color="#F43F5E" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.toggleTitle}>Run 13 AI Agents Immediately</Text>
                <Text style={styles.toggleSub}>
                  Dispatch forensic analysis pipeline right after ingestion completes.
                </Text>
              </View>
              <Switch
                value={runAgentsAfter}
                onValueChange={setRunAgentsAfter}
                trackColor={{ false: '#334155', true: '#0891B2' }}
                thumbColor="#FFFFFF"
                disabled={uploading}
              />
            </View>

            {uploading && (
              <View style={styles.progressBox}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={styles.progressLabel}>Ingesting VDR files... {progressPct}%</Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.uploadBtn,
              (uploading || files.length === 0) && { opacity: 0.5 },
            ]}
            onPress={handleUpload}
            disabled={uploading || files.length === 0}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                {runAgentsAfter ? (
                  <Rocket size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                ) : (
                  <CheckCircle2 size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.uploadBtnText}>
                  {runAgentsAfter ? 'Upload & Launch Agents' : 'Upload to Deal Vault'}
                </Text>
              </>
            )}
          </TouchableOpacity>
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
    maxHeight: '85%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  dealChip: {
    backgroundColor: '#182032',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
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
    fontSize: 12,
    fontWeight: '600',
  },
  dealChipTextActive: {
    color: '#67E8F9',
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(6, 182, 212, 0.45)',
    backgroundColor: 'rgba(6, 182, 212, 0.05)',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  dropTitle: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  dropSub: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  fileList: {
    marginBottom: 14,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  toggleTitle: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  progressBox: {
    marginBottom: 14,
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
  progressLabel: {
    color: '#67E8F9',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0891B2',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 6,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
