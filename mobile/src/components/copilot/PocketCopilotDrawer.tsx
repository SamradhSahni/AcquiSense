import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Bot, Mic, Send, X, FileText, Sparkles } from 'lucide-react-native';
import { useDealStore } from '../../stores/useDealStore';
import { useResumableCopilot } from '../../hooks/useResumableCopilot';

interface Props {
  dealId: string;
}

export const PocketCopilotDrawer: React.FC<Props> = ({ dealId }) => {
  const { isCopilotOpen, setCopilotOpen, setCitationsOpen } = useDealStore();
  const [inputText, setInputText] = useState('');
  const {
    messages,
    isRecording,
    sendMessage,
    startVoiceRecording,
    stopVoiceAndSend,
  } = useResumableCopilot(dealId);

  if (!isCopilotOpen) return null;

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <Modal
      visible={isCopilotOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setCopilotOpen(false)}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.botIconCircle}>
                <Bot size={18} color="#06B6D4" />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.headerTitle}>Pocket Copilot</Text>
                  <View style={styles.onlinePill}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>SSE Active</Text>
                  </View>
                </View>
                <Text style={styles.headerSubtitle}>Zero-Trust Grounded Diligence RAG</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setCopilotOpen(false)} style={styles.closeBtn}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Quick Prompts */}
          <View style={styles.promptBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[
                'Why is this deal high risk?',
                'Show all P0/P1 findings',
                'EBITDA adjustments breakdown',
                'Legal & Cyber dependencies',
              ].map((p, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.promptChip}
                  onPress={() => sendMessage(p)}
                >
                  <Sparkles size={11} color="#06B6D4" style={{ marginRight: 4 }} />
                  <Text style={styles.promptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Chat Messages */}
          <ScrollView
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Bot size={36} color="#334155" />
                <Text style={styles.emptyTitle}>AcquiSense Pocket Copilot</Text>
                <Text style={styles.emptyDesc}>
                  Ask anything about deal findings, valuation impacts, indemnities, or press the
                  mic for Hold-to-Talk diligence queries.
                </Text>
              </View>
            ) : (
              messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.messageRow,
                    m.role === 'user' ? styles.userRow : styles.assistantRow,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      m.role === 'user' ? styles.userBubble : styles.assistantBubble,
                    ]}
                  >
                    <Text style={styles.messageText}>{m.content}</Text>
                    {m.isStreaming && (
                      <View style={styles.streamingIndicator}>
                        <ActivityIndicator size="small" color="#06B6D4" />
                        <Text style={styles.streamingText}>Synthesizing VDR data...</Text>
                      </View>
                    )}

                    {m.citations && m.citations.length > 0 && (
                      <View style={styles.citationsSection}>
                        <Text style={styles.citationsTitle}>VERIFIED SOURCES ({m.citations.length})</Text>
                        {m.citations.map((c, cIdx) => (
                          <TouchableOpacity
                            key={cIdx}
                            style={styles.citationPill}
                            onPress={() => setCitationsOpen(true, c)}
                          >
                            <FileText size={12} color="#06B6D4" style={{ marginRight: 6 }} />
                            <Text style={styles.citationPillText} numberOfLines={1}>
                              {c.file} {c.page ? `(p.${c.page})` : ''}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Input & Voice Controls */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.inputField}
              placeholder="Ask Copilot about this deal..."
              placeholderTextColor="#64748B"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
            />

            <TouchableOpacity
              style={[styles.voiceBtn, isRecording && styles.voiceBtnActive]}
              onPressIn={startVoiceRecording}
              onPressOut={stopVoiceAndSend}
            >
              <Mic size={18} color={isRecording ? '#FFFFFF' : '#06B6D4'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Send size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {isRecording && (
            <View style={styles.recordingBanner}>
              <View style={styles.recordingPulseDot} />
              <Text style={styles.recordingText}>Listening... Release to transcribe with Whisper</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  container: {
    backgroundColor: '#0E131F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    height: '82%',
    display: 'flex',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  botIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: 8,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  onlineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  onlineText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  promptBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  promptText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E2E8F0',
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  messageRow: {
    marginBottom: 12,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    borderRadius: 12,
    padding: 12,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: '#1D4ED8',
  },
  assistantBubble: {
    backgroundColor: '#182032',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  messageText: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  streamingText: {
    color: '#06B6D4',
    fontSize: 11,
    marginLeft: 6,
  },
  citationsSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  citationsTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  citationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 4,
  },
  citationPillText: {
    color: '#67E8F9',
    fontSize: 11,
    flex: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#07090E',
  },
  inputField: {
    flex: 1,
    backgroundColor: '#182032',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 8,
  },
  voiceBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  voiceBtnActive: {
    backgroundColor: '#EF4444',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7F1D1D',
    paddingVertical: 6,
  },
  recordingPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 8,
  },
  recordingText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
});

