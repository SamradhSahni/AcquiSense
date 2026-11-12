import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FileText, Shield, X, ExternalLink } from 'lucide-react-native';
import { useDealStore } from '../../stores/useDealStore';
import { downloadAndOpenWatermarkedPdf } from '../../services/webApi';

export const CitationsBottomSheet: React.FC = () => {
  const { isCitationsOpen, activeCitation, selectedDeal, setCitationsOpen } = useDealStore();
  const [downloading, setDownloading] = useState(false);

  if (!isCitationsOpen || !activeCitation) return null;

  const handleOpenWatermarkedPdf = async () => {
    if (!selectedDeal) return;
    setDownloading(true);
    try {
      await downloadAndOpenWatermarkedPdf(
        selectedDeal.id,
        activeCitation.file,
        activeCitation.file
      );
    } catch (err: any) {
      Alert.alert(
        'Document Stream Notice',
        err?.message || 'Unable to stream watermarked document. Verify backend connectivity and file presence in VDR.'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      visible={isCitationsOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setCitationsOpen(false)}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Shield size={18} color="#06B6D4" style={{ marginRight: 8 }} />
              <Text style={styles.title}>VDR Source Verification</Text>
            </View>
            <TouchableOpacity onPress={() => setCitationsOpen(false)} style={styles.closeBtn}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.fileCard}>
              <FileText size={18} color="#3B82F6" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName}>{activeCitation.file}</Text>
                <Text style={styles.pageInfo}>
                  {activeCitation.page ? `Page ${activeCitation.page} • ` : ''}
                  {activeCitation.section || 'General Section'}
                </Text>
              </View>
            </View>

            <Text style={styles.quoteLabel}>EVIDENCE EXCERPT & CITATION</Text>
            <View style={styles.quoteBox}>
              <Text style={styles.quoteText}>"{activeCitation.quote}"</Text>
            </View>

            <View style={styles.watermarkNotice}>
              <Shield size={14} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.watermarkNoticeText}>
                Zero-Trust Watermark: Server burns analyst email, IP address, and UTC timestamp diagonally across every page before streaming.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.viewPdfButton, downloading && { opacity: 0.7 }]}
              onPress={handleOpenWatermarkedPdf}
              disabled={downloading}
            >
              {downloading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <ExternalLink size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.viewPdfButtonText}>Open Watermarked Document</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0E131F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    maxHeight: '75%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    marginBottom: 10,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  pageInfo: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  quoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  quoteBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#06B6D4',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#E2E8F0',
    fontStyle: 'italic',
  },
  watermarkNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
  },
  watermarkNoticeText: {
    fontSize: 11,
    color: '#34D399',
    flex: 1,
  },
  viewPdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E3A8A',
    borderRadius: 10,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  viewPdfButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
