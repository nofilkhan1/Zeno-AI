import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, Dimensions } from 'react-native';
import { Mic, MicOff, PhoneOff } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAudioStream, requestRecordingPermissionsAsync } from 'expo-audio';
import type { AudioStreamBuffer } from 'expo-audio';
import { useColors, typography } from '../lib/theme';
import { speak, stopTTS, subscribeToTTS } from '../lib/tts';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_HOST = SUPABASE_URL.replace('https://', '');
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat`;
const VAD_THRESHOLD = 1000;
const VAD_CONSECUTIVE = 3;

type VoiceState = 'listening' | 'processing' | 'speaking';

type Props = {
  chatId: string;
  onClose: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORB_SIZE = Math.min(SCREEN_WIDTH * 0.55, 200);

export default function VoiceMode({ chatId, onClose }: Props) {
  const colors = useColors();
  const t = typography(colors);
  const [state, setState] = useState<VoiceState>('listening');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const cancelledRef = useRef(false);
  const streamStoppedRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const vadCountRef = useRef(0);
  const stateRef = useRef<VoiceState>('listening');
  const handleUtteranceEndRef = useRef<() => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const thinkingAnim = useRef(new Animated.Value(0)).current;
  const spokeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  // ── Audio stream (always active in voice mode) ──────────────
  const { stream } = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16' });

  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  // ── Setup audio listener ───────────────────────────────────
  useEffect(() => {
    if (!stream) return;
    const handler = (buffer: AudioStreamBuffer) => {
      if (cancelledRef.current || mutedRef.current) return;
      const st = stateRef.current;
      if (st === 'listening') {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(buffer.data);
        }
      } else if (st === 'speaking' || st === 'processing') {
        const rms = computeRMS(buffer.data);
        if (rms > VAD_THRESHOLD) {
          vadCountRef.current++;
          if (vadCountRef.current >= VAD_CONSECUTIVE && st === 'speaking') {
            vadCountRef.current = 0;
            handleBargeIn();
          }
        } else {
          vadCountRef.current = 0;
        }
      }
    };
    listenerRef.current = stream.addListener('audioStreamBuffer', handler);
    stream.start().catch((e: unknown) => console.error('[VOICE] stream.start error:', e));
    return () => {
      listenerRef.current?.remove();
      if (!streamStoppedRef.current) {
        streamStoppedRef.current = true;
        try { stream.stop(); } catch (e) { console.error('[VOICE] stream.stop error:', e); }
      }
    };
  }, [stream]);

  // ── Start listening (open WebSocket) ───────────────────────
  const startListening = useCallback(async () => {
    if (cancelledRef.current) return;
    if (wsRef.current) return; // guard: already listening
    setTranscript('');
    setInterimText('');
    finalTranscriptRef.current = '';
    setState('listening');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const ws = new WebSocket(`wss://${SUPABASE_HOST}/functions/v1/speech-token?token=${session.access_token}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[VOICE] WS open');
    };

    ws.onmessage = (e) => {
      let raw: string;
      if (typeof e.data === 'string') raw = e.data;
      else if (e.data instanceof ArrayBuffer) raw = new TextDecoder().decode(e.data);
      else return;

      try {
        const msg = JSON.parse(raw);
        if (msg.type === '_proxy_status') return;
        if (msg.type !== 'Results') return;

        const alt = msg.channel?.alternatives?.[0];
        const text = alt?.transcript || '';

        if (msg.is_final) {
          finalTranscriptRef.current = text
            ? (finalTranscriptRef.current + text + ' ').trim()
            : finalTranscriptRef.current;
          setTranscript(finalTranscriptRef.current);
          setInterimText('');

          if (msg.speech_final) {
            console.log('[VOICE] speech_final detected, transcript:', finalTranscriptRef.current);
            if (finalTranscriptRef.current.trim()) {
              handleUtteranceEndRef.current();
            } else {
              startListeningRef.current();
            }
          }
        } else {
          setInterimText(text);
        }
      } catch {}
    };

    ws.onerror = () => {
      if (!cancelledRef.current) setErrorMsg('Connection lost');
    };

    ws.onclose = () => {};
  }, []);

  // ── Utterance end → PROCESSING → chat API → SPEAKING ──────
  const handleUtteranceEnd = useCallback(async () => {
    const text = finalTranscriptRef.current.trim();
    if (!text) { startListening(); return; }

    setState('processing');
    wsRef.current?.close();
    wsRef.current = null;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { startListening(); return; }

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: text }),
      });

      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);

      const replyText = data.content || '';
      if (!replyText) { startListening(); return; }

      setState('speaking');
      setTranscript(replyText);
      setInterimText('');

      speak(replyText).catch(() => {});

      const unsub = subscribeToTTS((ts) => {
        if (ts === 'idle' || ts === 'error') {
          unsub();
          if (!cancelledRef.current && stateRef.current === 'speaking') {
            startListening();
          }
        }
      });
    } catch (err) {
      console.error('[VOICE] Chat error:', err);
      if (!cancelledRef.current) startListening();
    }
  }, [chatId, startListening]);

  // ── Barge-in ───────────────────────────────────────────────
  const handleBargeIn = useCallback(() => {
    console.log('[VOICE] Barge-in detected');
    stopTTS();
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // ── Sync refs for callback freshness ──────────────────────
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { handleUtteranceEndRef.current = handleUtteranceEnd; }, [handleUtteranceEnd]);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── Initial start ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { setErrorMsg('Microphone permission required'); return; }
      startListening();
    })();

    return () => {
      cancelledRef.current = true;
      stopTTS();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // ── Orb animation ──────────────────────────────────────────
  useEffect(() => {
    pulseAnim.setValue(1);
    thinkingAnim.setValue(0);
    spokeAnim.setValue(0);

    if (state === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.6, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else if (state === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(thinkingAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(thinkingAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else if (state === 'speaking') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.95, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(spokeAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(spokeAnim, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(spokeAnim, { toValue: 0.7, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(spokeAnim, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }
  }, [state]);

  function handleEndCall() {
    if (cancelledRef.current) return; // guard: no double-tap
    cancelledRef.current = true;
    stopTTS();
    wsRef.current?.close();
    wsRef.current = null;
    // stream.stop() is handled by the effect cleanup on unmount + useReleasingSharedObject's auto-release
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onClose());
  }

  const displayText = (transcript || interimText).trim();

  const orbColor = state === 'listening' ? colors.accent
    : state === 'processing' ? (colors.textMuted)
    : colors.accent;

  const stateLabel = state === 'listening' ? 'Listening…'
    : state === 'processing' ? 'Thinking…'
    : 'Speaking…';

  return (
    <Animated.View style={[s.root, { backgroundColor: colors.bg, opacity: fadeAnim }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          style={({ pressed }) => [s.topBtn, pressed && { opacity: 0.6 }]}
          onPress={() => setMuted((m) => !m)}
        >
          {muted ? <MicOff size={20} color={colors.textMuted} /> : <Mic size={20} color={colors.textPrimary} />}
        </Pressable>
        <Text style={[t.captionMedium, { color: colors.textMuted }]}>Voice Mode</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Error */}
      {errorMsg ? (
        <Text style={[s.errorText, { color: colors.danger }]}>{errorMsg}</Text>
      ) : null}

      {/* Orb */}
      <View style={s.orbContainer}>
        <Animated.View
          style={[
            s.orbGlow,
            {
              width: ORB_SIZE * 1.5,
              height: ORB_SIZE * 1.5,
              borderRadius: ORB_SIZE * 0.75,
              backgroundColor: orbColor + '12',
              opacity: glowAnim,
            },
          ]}
        />
        <Animated.View
          style={[
            s.orb,
            {
              width: ORB_SIZE,
              height: ORB_SIZE,
              borderRadius: ORB_SIZE / 2,
              backgroundColor: orbColor,
              transform: [
                { scale: pulseAnim },
                {
                  rotate: state === 'speaking'
                    ? spokeAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '15deg'] })
                    : '0deg',
                },
              ],
              opacity: state === 'processing'
                ? thinkingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.8] })
                : 1,
            },
          ]}
        />
        <Text style={[s.stateLabel, { color: colors.textMuted }]}>{stateLabel}</Text>
      </View>

      {/* Transcript */}
      <View style={s.transcriptArea}>
        {displayText ? (
          <Text style={[t.body, { color: colors.textPrimary, textAlign: 'center' }]} numberOfLines={3}>
            {displayText}
          </Text>
        ) : (
          <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', fontStyle: 'italic' }]}>
            {state === 'listening' ? 'Say something…' : ''}
          </Text>
        )}
      </View>

      {/* End Call */}
      <View style={s.bottomArea}>
        <Pressable
          style={({ pressed }) => [s.endCallBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
          onPress={handleEndCall}
        >
          <PhoneOff size={28} color="#fff" />
        </Pressable>
        <Text style={[t.caption, { color: colors.textMuted, marginTop: 8 }]}>End Call</Text>
      </View>
    </Animated.View>
  );
}

function computeRMS(buffer: ArrayBuffer): number {
  const int16 = new Int16Array(buffer);
  if (int16.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < int16.length; i++) {
    sum += int16[i] * int16[i];
  }
  return Math.sqrt(sum / int16.length);
}

const s = StyleSheet.create({
  root: {
    ...    StyleSheet.absoluteFill,
    zIndex: 200,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
    fontSize: 14,
  },
  orbContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  orbGlow: {
    position: 'absolute',
  },
  orb: {},
  stateLabel: {
    fontSize: 15,
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
  },
  transcriptArea: {
    paddingHorizontal: 32,
    minHeight: 80,
    justifyContent: 'center',
    marginBottom: 16,
  },
  bottomArea: {
    alignItems: 'center',
    paddingBottom: 48,
  },
  endCallBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
