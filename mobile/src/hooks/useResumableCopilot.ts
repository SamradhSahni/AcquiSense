import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import { useAuthStore } from '../stores/useAuthStore';
import { useDealStore } from '../stores/useDealStore';
import { API_BASE_URL, forceRefreshTokenWithMutex } from '../services/api';
import { askCopilotRest } from '../services/webApi';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Array<{ file: string; page?: number; section?: string; quote: string }>;
  isStreaming?: boolean;
}

export function useResumableCopilot(dealId: string) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (query: string) => {
      const messageId = `msg_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: `usr_${Date.now()}`, role: 'user', content: query, citations: [] },
        { id: messageId, role: 'assistant', content: '', citations: [], isStreaming: true },
      ]);
      lastEventIdRef.current = null;

      let retries = 0;
      const maxRetries = 3;
      let currentToken = useAuthStore.getState().accessToken;

      while (retries <= maxRetries) {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentToken}`,
          };
          if (lastEventIdRef.current) {
            headers['Last-Event-ID'] = lastEventIdRef.current;
          }

          // Use standard global fetch (or expo/fetch in runtime)
          const response = await fetch(`${API_BASE_URL}/api/v1/mobile/copilot/stream`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              deal_id: dealId,
              message_id: messageId,
              query,
            }),
          });

          // [BUG-06 FIX]: Intercept 401 and refresh via shared mutex before retrying SSE stream
          if (response.status === 401) {
            currentToken = await forceRefreshTokenWithMutex();
            retries += 1;
            continue;
          }

          if (!response.ok || !response.body) {
            // Try Python REST Copilot fallback with Mongo report context
            const dealObj = useDealStore.getState().selectedDeal;
            const pyJobId = dealObj?.job?.pythonJobId || dealObj?.latestPythonJobId || null;
            const restRes = await askCopilotRest(dealId, {
              question: query,
              job_id: pyJobId,
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      content: restRes.answer || 'No copilot answer returned.',
                      citations: restRes.citations || [],
                      isStreaming: false,
                    }
                  : m
              )
            );
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || '';

            for (const block of blocks) {
              if (block.startsWith(': heartbeat')) continue; // Ignore keep-alive comments

              const lines = block.split('\n');
              let eventId = '';
              let eventType = 'token';
              let dataStr = '';

              for (const line of lines) {
                if (line.startsWith('id: ')) eventId = line.slice(4).trim();
                if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
              }

              if (eventId) lastEventIdRef.current = eventId;
              if (!dataStr) continue;

              try {
                const parsed = JSON.parse(dataStr);
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== messageId) return m;
                    if (eventType === 'token') return { ...m, content: m.content + (parsed.token || '') };
                    if (eventType === 'citation') return { ...m, citations: [...m.citations, parsed.citation] };
                    if (eventType === 'done' || eventType === 'error') return { ...m, isStreaming: false };
                    return m;
                  })
                );
              } catch (parseErr) {
                // Ignore raw non-JSON data
              }
            }
          }
          break;
        } catch (err) {
          retries += 1;
          if (retries > maxRetries) {
            try {
              const dealObj = useDealStore.getState().selectedDeal;
              const pyJobId = dealObj?.job?.pythonJobId || dealObj?.latestPythonJobId || null;
              const restRes = await askCopilotRest(dealId, {
                question: query,
                job_id: pyJobId,
              });
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        content: restRes.answer || m.content,
                        citations: restRes.citations || m.citations,
                        isStreaming: false,
                      }
                    : m
                )
              );
            } catch {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        content:
                          m.content ||
                          'Unable to reach Pocket Copilot backend. Ensure gateway and AI engine are running.',
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          } else {
            await new Promise((r) => setTimeout(r, 1200 * retries));
          }
        }
      }
    },
    [dealId]
  );

  // [FEAT-04]: Hold-to-Talk Voice Recording & Whisper Transcription
  const startVoiceRecording = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      console.warn('Voice recording start failed:', e);
    }
  }, []);

  const stopVoiceAndSend = useCallback(async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) return;

      const formData = new FormData();
      formData.append('deal_id', dealId);
      formData.append('audio', {
        uri,
        name: 'voice_query.m4a',
        type: 'audio/m4a',
      } as any);

      const token = useAuthStore.getState().accessToken;
      const res = await fetch(`${API_BASE_URL}/api/v1/mobile/copilot/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const { transcript } = await res.json();
        if (transcript?.trim()) {
          await sendMessage(transcript.trim());
        }
      }
    } catch (e) {
      console.warn('Voice send failed:', e);
    }
  }, [dealId, sendMessage]);

  return { messages, isRecording, sendMessage, startVoiceRecording, stopVoiceAndSend };
}

