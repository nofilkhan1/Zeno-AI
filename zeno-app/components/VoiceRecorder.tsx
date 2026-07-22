import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { Mic, Square, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAudioStream, requestRecordingPermissionsAsync } from 'expo-audio';
import type { AudioStreamBuffer } from 'expo-audio';
import { useColors, typography, radii, hitSlop } from '../lib/theme';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_HOST = SUPABASE_URL.replace('https://', '');

type Props = {
  onTranscript: (text: string) => void;
  onCancel: () => void;
};

type Stage = 'init' | 'connecting' | 'recording' | 'error' | 'done';

function formatTime(seconds: number) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function VoiceRecorder({ onTranscript, onCancel }: Props) {
  const colors = useColors();
  const t = typography(colors);
  const [stage, setStage] = useState<Stage>('init');
  const [errorMsg, setErrorMsg] = useState('');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [duration, setDuration] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const finalTranscriptRef = useRef('');
  const cancelledRef = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const mountId = useRef(Math.random().toString(36).slice(2, 8)).current;

  useEffect(() => {
    console.log('[STT] MOUNT id=' + mountId);
    startFlow();
    return () => {
      console.log('[STT] UNMOUNT id=' + mountId);
      cleanup();
    };
  }, []);

  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
  });

  useEffect(() => {
    if (stage !== 'recording') return;
    const id = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (stage === 'connecting' || stage === 'recording') {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [stage]);

  useEffect(() => {
    if (stage === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.18,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [stage]);

  async function startFlow() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg('Microphone permission is required for speech-to-text.');
      setStage('error');
      return;
    }

    setStage('connecting');

    // 1. Get session id from Edge Function
    let sessionId = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/speech-token`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Session request failed');
      const data = await res.json();
      sessionId = data.session_id;
    } catch (err) {
      console.error('[STT] Session fetch error:', err);
      setErrorMsg('Failed to connect. Check your network and try again.');
      setStage('error');
      return;
    }

    // 2. Open WebSocket to Edge Function (proxies to Deepgram)
    const ws = new WebSocket(`wss://${SUPABASE_HOST}/functions/v1/speech-token?session=${sessionId}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    const wsOpenTime = Date.now();
    let totalBytesSent = 0;
    let chunksSent = 0;

    ws.onopen = () => {
      console.log('[STT] WebSocket OPEN — proxy connected');
      // Start audio stream — data will flow through the WS proxy to Deepgram
      if (stream) {
        console.log('[STT] Adding audioStreamBuffer listener & starting stream');
        listenerRef.current = stream.addListener('audioStreamBuffer', (buffer: AudioStreamBuffer) => {
          if (ws.readyState === WebSocket.OPEN && !cancelledRef.current) {
            const byteLen = buffer.data.byteLength;
            totalBytesSent += byteLen;
            chunksSent++;
            console.log('[STT] Sending audio chunk #' + chunksSent + ' size=' + byteLen + ' total=' + totalBytesSent);
            ws.send(buffer.data);
          }
        });
        stream.start();
        console.log('[STT] Audio stream started');
      } else {
        console.warn('[STT] No stream object available');
      }
      setStage('recording');
    };

    ws.onmessage = (e) => {
      try {
        // Log EVERY received message with type and size
        const dataType = typeof e.data;
        const dataSize = e.data instanceof ArrayBuffer ? e.data.byteLength :
          typeof e.data === 'string' ? e.data.length :
          typeof e.data === 'object' && e.data?.byteLength ? e.data.byteLength : -1;
        console.log('[STT] RAW MSG dataType=' + dataType + ' size=' + dataSize + ' preview=' + String(e.data).substring(0, 80));

        let raw: string;
        if (typeof e.data === 'string') {
          raw = e.data;
        } else if (e.data instanceof ArrayBuffer) {
          raw = new TextDecoder().decode(e.data);
        } else if (e.data && typeof e.data === 'object' && 'data' in (e.data as any)) {
          raw = String((e.data as any).data);
        } else if (typeof Buffer !== 'undefined' && e.data instanceof Buffer) {
          raw = e.data.toString('utf-8');
        } else {
          console.log('[STT] Unhandled message data type, cannot parse');
          return;
        }
        if (!raw) return;
        const msg = JSON.parse(raw);

        // Proxy diagnostic messages
        if (msg.type === '_proxy_status') {
          console.log('[STT] PROXY STATUS:', JSON.stringify(msg));
          return;
        }

        console.log('[STT] WS message type:', msg.type, 'is_final:', msg.is_final, 'text:', msg.channel?.alternatives?.[0]?.transcript?.substring(0, 60));
        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0];
          const text = alt?.transcript || '';
          if (msg.is_final) {
            setTranscript((prev) => {
              const next = text ? (prev ? prev + text + ' ' : text + ' ') : prev;
              console.log('[STT] transcript updated, total chars:', next.length);
              finalTranscriptRef.current = next;
              return next;
            });
            setInterimText('');
          } else {
            console.log('[STT] interim update:', text?.substring(0, 60));
            setInterimText(text);
          }
        } else if (msg.type === 'Error' || msg.type === 'error') {
          console.error('[STT] Deepgram error:', msg.err_msg || msg.message || JSON.stringify(msg));
        }
      } catch (err) {
        console.warn('[STT] Failed to parse WS message:', (err as Error)?.message);
      }
    };

    ws.onerror = (e) => {
      console.error('[STT] WebSocket error event');
      if (!cancelledRef.current) {
        setErrorMsg('Connection lost. Please try again.');
        setStage('error');
      }
    };

    ws.onclose = (e) => {
      const elapsed = ((Date.now() - wsOpenTime) / 1000).toFixed(1);
      console.log('[STT] WebSocket CLOSED code:', e.code, 'reason:', e.reason);
      console.log('[STT] Elapsed:', elapsed + 's, chunks sent:', chunksSent, 'bytes sent:', totalBytesSent);
    };
  }

  function stopRecording() {
    cancelledRef.current = true;
    cleanup();
    const finalText = finalTranscriptRef.current.trim() || interimText.trim();
    onTranscript(finalText);
    setStage('done');
  }

  function cancelRecording() {
    cancelledRef.current = true;
    cleanup();
    onCancel();
  }

  function cleanup() {
    try { stream?.stop(); } catch {}
    if (listenerRef.current) {
      try { listenerRef.current.remove(); } catch {}
      listenerRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
  }

  const displayText = (transcript + interimText).trim();

  return (
    <Animated.View style={[s.wrapper, { opacity: fadeAnim, backgroundColor: colors.composerBg, borderColor: colors.composerBorder }]}>
      <View style={s.container}>
        <View style={s.topRow}>
          <Pressable
            style={({ pressed }) => [s.actionBtn, { borderColor: colors.composerBorder }, pressed && { opacity: 0.6 }]}
            onPress={cancelRecording}
            hitSlop={hitSlop}
          >
            <X size={18} color={colors.textMuted} />
            <Text style={[t.caption, { marginLeft: 6 }]}>Cancel</Text>
          </Pressable>

          <Text style={[t.captionMedium, { color: colors.textMuted }]}>
            {stage === 'connecting' ? 'Connecting…' : formatTime(duration)}
          </Text>

          <Pressable
            style={({ pressed }) => [s.actionBtn, { borderColor: colors.danger }, pressed && { opacity: 0.6 }]}
            onPress={stopRecording}
            hitSlop={hitSlop}
          >
            <Square size={16} color={colors.danger} fill={colors.danger} />
            <Text style={[t.caption, { color: colors.danger, marginLeft: 6 }]}>Stop</Text>
          </Pressable>
        </View>

        {stage === 'error' ? (
          <View style={s.centerContent}>
            <View style={[s.errorCircle, { backgroundColor: colors.danger + '20' }]}>
              <X size={28} color={colors.danger} />
            </View>
            <Text style={[t.body, { color: colors.danger, textAlign: 'center', marginTop: 16 }]}>{errorMsg}</Text>
            <Pressable
              style={({ pressed }) => [s.retryBtn, { backgroundColor: colors.accent }, pressed && { opacity: 0.7 }]}
              onPress={() => { cancelledRef.current = false; setStage('init'); setErrorMsg(''); startFlow(); }}
            >
              <Text style={[t.bodyMedium, { color: '#fff' }]}>Try Again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={s.centerContent}>
              <Animated.View
                style={[
                  s.micCircle,
                  {
                    backgroundColor: colors.accent + '18',
                    transform: [{ scale: stage === 'recording' ? pulseAnim : 1 }],
                  },
                ]}
              >
                <View style={[s.micInner, { backgroundColor: colors.accent }]}>
                  <Mic size={28} color="#fff" />
                </View>
              </Animated.View>
            </View>

            <View style={s.transcriptArea}>
              {displayText ? (
                <Text style={[t.body, { color: colors.textPrimary, textAlign: 'center' }]} numberOfLines={4}>
                  {displayText}
                </Text>
              ) : (
                <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', fontStyle: 'italic' }]}>
                  {stage === 'connecting' ? '' : 'Listening…'}
                </Text>
              )}
            </View>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrapper: { borderWidth: 1, borderRadius: radii.md, marginHorizontal: 12, marginBottom: 12 },
  container: { paddingHorizontal: 16, paddingVertical: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  centerContent: { alignItems: 'center', paddingVertical: 12 },
  micCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  micInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  errorCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  retryBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: radii.sm, marginTop: 16 },
  transcriptArea: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 8, marginTop: 4 },
});
