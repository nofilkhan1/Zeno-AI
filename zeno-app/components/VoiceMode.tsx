import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, Dimensions } from 'react-native';
import { Mic, MicOff, PhoneOff, X, Check } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAudioStream, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import type { AudioStreamBuffer } from 'expo-audio';
import { useColors, typography } from '../lib/theme';
import { speak, stopTTS, subscribeToTTS, getTTSState } from '../lib/tts';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_HOST = SUPABASE_URL.replace('https://', '');
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat`;
const VAD_THRESHOLD = 1000;
const VAD_CONSECUTIVE = 3;
const VOICE_MODEL = 'nvidia/nemotron-mini-4b-instruct';
const CHAT_TIMEOUT = 25000;

type VoiceState = 'listening' | 'processing' | 'speaking';

type Props = {
  chatId: string;
  onClose: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORB_SIZE = Math.min(SCREEN_WIDTH * 0.55, 200);

function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = '';
  for (const part of parts) {
    if (!buf) { buf = part; continue; }
    if (buf.length + part.length < 200) { buf += ' ' + part; continue; }
    chunks.push(buf);
    buf = part;
  }
  if (buf) chunks.push(buf);
  if (chunks.length === 0 && text) chunks.push(text);
  return chunks;
}

function speakChunk(chunk: string): Promise<void> {
  console.log('[VOICE] speakChunk start, chunk length:', chunk.length, 'text:', chunk.slice(0, 40));
  return new Promise((resolve) => {
    Promise.resolve(speak(chunk)).then(() => {
      console.log('[VOICE] speakChunk: speak() resolved, subscribing to TTS');
      let resolved = false;
      const unsub = subscribeToTTS((status, err) => {
        console.log('[VOICE] speakChunk TTS event: state=', status, 'error=', err);
        if (resolved) return;
        if (status === 'idle' || status === 'error') {
          resolved = true;
          unsub();
          console.log('[VOICE] speakChunk: resolving via subscription, state:', status);
          resolve();
        }
      });
      const cur = getTTSState().state;
      console.log('[VOICE] speakChunk: current TTS state after subscribe:', cur);
      if (cur === 'idle' || cur === 'error') {
        resolved = true;
        unsub();
        console.log('[VOICE] speakChunk: resolving immediately, state:', cur);
        resolve();
      }
    }, (err) => {
      console.error('[VOICE] speakChunk: speak() rejected:', err);
      resolve();
    });
  });
}

export default function VoiceMode({ chatId, onClose }: Props) {
  const colors = useColors();
  const t = typography(colors);
  const [state, setState] = useState<VoiceState>('listening');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected'>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const cancelledRef = useRef(false);
  const streamPausedForSpeechRef = useRef(false);
  const streamReleasedRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadCountRef = useRef(0);
  const stateRef = useRef<VoiceState>('listening');
  const handleUtteranceEndRef = useRef<() => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const thinkingAnim = useRef(new Animated.Value(0)).current;
  const spokeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  // ── Centralized stream lifecycle management (single point of control) ──
  const safeStopStream = useCallback((reason: string) => {
    if (!stream || streamReleasedRef.current) {
      console.log('[VOICE] safeStopStream(' + reason + '): skipped (streamReleased=' + streamReleasedRef.current + ')');
      return;
    }
    try {
      stream.stop();
      console.log('[VOICE] safeStopStream(' + reason + '): OK');
    } catch (e) {
      console.error('[VOICE] safeStopStream(' + reason + ') error:', e);
    }
  }, [stream]);

  const safeStartStream = useCallback(async (reason: string) => {
    if (!stream || streamReleasedRef.current) {
      console.log('[VOICE] safeStartStream(' + reason + '): skipped (streamReleased=' + streamReleasedRef.current + ')');
      return;
    }
    try {
      await stream.start();
      console.log('[VOICE] safeStartStream(' + reason + '): OK');
    } catch (e) {
      console.error('[VOICE] safeStartStream(' + reason + ') error:', e);
    }
  }, [stream]);

  // ── Pause mic during SPEAKING (releases Android audio routing for TTS playback) ──
  const pauseStreamForSpeech = useCallback(async () => {
    if (streamPausedForSpeechRef.current) return;
    streamPausedForSpeechRef.current = true;
    safeStopStream('pauseForSpeech');
  }, [safeStopStream]);

  const resumeStreamForListening = useCallback(async () => {
    if (!streamPausedForSpeechRef.current) return;
    streamPausedForSpeechRef.current = false;
    await safeStartStream('resumeForListening');
  }, [safeStartStream]);

  // ── Audio stream (always active in voice mode) ──────────────
  const { stream } = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16' });

  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  // ── Init audio session for simultaneous record+playback ────
  useEffect(() => {
    console.log('[TTS-DEBUG] 7. Initial audio mode: playsInSilent=true, shouldPlayInBackground=true, shouldRouteThroughEarpiece=false, interruptionMode=mixWithOthers, allowsRecording=true');
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'mixWithOthers',
      allowsRecording: true,
    }).then(() => {
      console.log('[TTS-DEBUG] 7. Initial audio mode set successfully');
    }).catch((e: unknown) => console.warn('[VOICE] Audio mode init error:', e));
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
    safeStartStream('effectSetup');
    return () => {
      listenerRef.current?.remove();
    };
  }, [stream]);

  // ── Start listening (open WebSocket) ───────────────────────
  const startListening = useCallback(async () => {
    if (cancelledRef.current) return;
    if (wsRef.current) return;
    setTranscript('');
    setInterimText('');
    setErrorMsg('');
    finalTranscriptRef.current = '';
    setState('listening');
    setConnectionStatus('connecting');

    await resumeStreamForListening();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    function resetSilenceTimer() {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      // Use longer timeout now that we have ✓/✗ buttons — silence is backup only
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        const text = finalTranscriptRef.current.trim();
        if (text) {
          console.log('[VOICE] Backup silence timeout, submitting:', text);
          handleUtteranceEndRef.current();
        }
      }, 6000);
    }

    const ws = new WebSocket(`wss://${SUPABASE_HOST}/functions/v1/speech-token?token=${session.access_token}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[VOICE] WS open');
      if (!cancelledRef.current) setConnectionStatus('connected');
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
        } else {
          setInterimText(text);
        }

        resetSilenceTimer();
      } catch {}
    };

    ws.onerror = (e) => {
      if (!cancelledRef.current) {
        const msg = (e as any).message || JSON.stringify(e) || 'unknown';
        console.warn('[VOICE] WS error:', msg);
      }
    };

    ws.onclose = (e) => {
      console.log('[VOICE] WS closed: code=' + e.code + ' reason=' + e.reason + ' wasClean=' + e.wasClean);
    };
  }, []);

  // ── Explicit confirm (✓): submit utterance ─────────────────
  const handleConfirm = useCallback(() => {
    const text = finalTranscriptRef.current.trim();
    if (!text) return;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    handleUtteranceEndRef.current();
  }, []);

  // ── Explicit cancel (✗): discard utterance, stay listening ─
  const handleCancel = useCallback(() => {
    console.log('[VOICE] User cancelled utterance');
    finalTranscriptRef.current = '';
    setTranscript('');
    setInterimText('');
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    // Keep listening fresh — reset VAD count too
    vadCountRef.current = 0;
  }, []);

  // ── Utterance end → PROCESSING → chat API → SPEAKING (chunked TTS) ──
  const handleUtteranceEnd = useCallback(async () => {
    const text = finalTranscriptRef.current.trim();
    if (!text) { startListening(); return; }

    setState('processing');
    stateRef.current = 'processing';
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    wsRef.current?.close();
    wsRef.current = null;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { startListening(); return; }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT);

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: text, modelOverride: VOICE_MODEL }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);

      const replyText = data.content || '';
      if (!replyText) { startListening(); return; }

      console.log('[TTS-DEBUG] 1. Starting TTS for text:', replyText.slice(0, 50));
      console.log('[TTS-DEBUG] 1. Full response length:', replyText.length, 'chars, chunks:', splitIntoSentences(replyText).length);

      setState('speaking');
      stateRef.current = 'speaking';
      setTranscript('');
      setInterimText('');

      if (cancelledRef.current) return;

      // Step 7: Ensure audio session is configured for simultaneous record+playback
      console.log('[TTS-DEBUG] 7. Setting audio mode: playsInSilent=true, shouldPlayInBackground=true, shouldRouteThroughEarpiece=false, interruptionMode=mixWithOthers, allowsRecording=true');
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'mixWithOthers',
        allowsRecording: true,
      }).then(() => {
        console.log('[TTS-DEBUG] 7. Audio mode set successfully');
      }).catch((e: unknown) => {
        console.error('[TTS-DEBUG] 7. Audio mode set failed:', e);
      });

      // Stop mic stream to release Android audio routing during TTS playback
      console.log('[VOICE] Pausing mic stream for TTS playback');
      await pauseStreamForSpeech();

      const chunks = splitIntoSentences(replyText);
      console.log('[TTS-DEBUG] Chunks total:', chunks.length);
      let spokenText = '';
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        console.log('[TTS-DEBUG] Chunk ' + (ci + 1) + '/' + chunks.length + ' queued: "' + chunk.slice(0, 60) + '" (len=' + chunk.length + ')');
        if (cancelledRef.current || stateRef.current !== 'speaking') {
          console.log('[TTS-DEBUG] Chunk ' + (ci + 1) + ' SKIPPED: cancelled=' + cancelledRef.current + ' stateRef=' + stateRef.current);
          break;
        }
        await speakChunk(chunk);
        spokenText += chunk + ' ';
        setTranscript(spokenText.trim());
        console.log('[TTS-DEBUG] Chunk ' + (ci + 1) + '/' + chunks.length + ' finished playing');
      }

      if (!cancelledRef.current && stateRef.current === 'speaking') {
        startListening();
      }
    } catch (err) {
      console.error('[VOICE] Chat error:', err);
      if (!cancelledRef.current) startListening();
    }
  }, [chatId, startListening]);

  // ── Barge-in (hard reset) ───────────────────────────────────
  const handleBargeIn = useCallback(() => {
    const wasSpeaking = stateRef.current === 'speaking';
    console.log('[TTS-DEBUG] Barge-in triggered during speaking=' + wasSpeaking + ' state=' + stateRef.current);
    cancelledRef.current = true;
    stateRef.current = 'listening';
    stopTTS();
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    wsRef.current?.close();
    wsRef.current = null;
    vadCountRef.current = 0;
    finalTranscriptRef.current = '';

    setState('listening');
    cancelledRef.current = false;
    setConnectionStatus('connecting');

    startListening();
  }, [startListening]);

  // ── Sync refs for callback freshness ──────────────────────
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { handleUtteranceEndRef.current = handleUtteranceEnd; }, [handleUtteranceEnd]);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── Initial start (deferred for immediate UI) ──────────────
  useEffect(() => {
    cancelledRef.current = false;

    const timer = setTimeout(async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { setErrorMsg('Microphone permission required'); return; }
      if (!cancelledRef.current) startListening();
    }, 0);

    return () => {
      clearTimeout(timer);
      cancelledRef.current = true;
      streamReleasedRef.current = true;
      stopTTS();
      wsRef.current?.close();
      wsRef.current = null;
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
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
    if (cancelledRef.current) return;
    cancelledRef.current = true;

    // Save any captured transcript as a user message
    const pendingText = (finalTranscriptRef.current || transcript).trim();
    if (pendingText) {
      Promise.resolve(supabase.from('messages').insert({
        chat_id: chatId, role: 'user', content: pendingText, created_at: new Date().toISOString(),
      })).then(() => {}, () => {});
    }

    stopTTS();
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    wsRef.current?.close();
    wsRef.current = null;

    safeStopStream('handleEndCall');

    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onClose());
  }

  const displayText = (transcript || interimText).trim();

  const orbColor = state === 'listening' ? colors.accent
    : state === 'processing' ? (colors.textMuted)
    : colors.accent;

  const stateLabel = connectionStatus === 'connecting' ? 'Connecting…'
    : state === 'listening' ? 'Listening…'
    : state === 'processing' ? 'Thinking…'
    : 'Speaking…';

  const listeningButtonsVisible = state === 'listening' && connectionStatus === 'connected';

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
        <Text style={[t.captionMedium, { color: colors.textMuted }]}>Voice to Voice</Text>
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

      {/* Confirm/Cancel buttons (only during active listening) */}
      {listeningButtonsVisible ? (
        <View style={s.confirmArea}>
          <Pressable
            style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
            onPress={handleCancel}
          >
            <X size={24} color="#fff" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.confirmBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
            onPress={handleConfirm}
          >
            <Check size={24} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {/* Bottom button: End Call (always visible) */}
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
  confirmArea: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginBottom: 24,
  },
  cancelBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
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
