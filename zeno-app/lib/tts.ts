import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type TTSState = 'idle' | 'loading' | 'playing' | 'error';
type TTSListener = (state: TTSState, errorMsg?: string, owner?: string, sessionId?: number) => void;
type CompletionReason = 'finished' | 'fallback' | 'cancelled' | 'blocked' | 'error';

export type SpeakOptions = {
  owner?: string;
  sessionId?: number;
  chunk?: number;
  interrupt?: boolean;
};

export type TTSPlaybackResult = {
  completed: boolean;
  reason: CompletionReason;
};

type ActivePlayback = {
  id: number;
  owner: string;
  sessionId?: number;
  chunk?: number;
  resolve: (result: TTSPlaybackResult) => void;
  playbackSub: { remove: () => void } | null;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
};

let player: ReturnType<typeof createAudioPlayer> | null = null;
let activePlayback: ActivePlayback | null = null;
let nextPlaybackId = 0;
const listeners = new Set<TTSListener>();
let state: TTSState = 'idle';
let errorMessage = '';

function logTts(event: string, details: Record<string, number | string | boolean | undefined>) {
  console.log('[TTS-DIAG]', event, details);
}

function notify(owner?: string, sessionId?: number) {
  listeners.forEach((listener) => listener(state, errorMessage, owner, sessionId));
}

function setState(next: TTSState, owner?: string, sessionId?: number, error?: string) {
  state = next;
  errorMessage = error || '';
  notify(owner, sessionId);
}

export function subscribeToTTS(listener: TTSListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTTSState() {
  return { state, error: errorMessage, owner: activePlayback?.owner, sessionId: activePlayback?.sessionId };
}

function ensurePlayer() {
  if (!player) {
    player = createAudioPlayer(null, { downloadFirst: false });
    try { (player as any).volume = 1; } catch {}
  }
  return player;
}

function clearPlaybackResources(playback: ActivePlayback) {
  playback.playbackSub?.remove();
  playback.playbackSub = null;
  if (playback.fallbackTimer) clearTimeout(playback.fallbackTimer);
  playback.fallbackTimer = null;
}

function settlePlayback(playback: ActivePlayback, result: TTSPlaybackResult, error?: string) {
  if (activePlayback?.id !== playback.id) return;
  clearPlaybackResources(playback);
  activePlayback = null;
  setState(result.reason === 'error' ? 'error' : 'idle', playback.owner, playback.sessionId, error);
  logTts(result.reason === 'finished' || result.reason === 'fallback' ? 'playback-finish' : 'playback-cancel', {
    owner: playback.owner,
    sessionId: playback.sessionId,
    chunk: playback.chunk,
    reason: result.reason,
  });
  playback.resolve(result);
}

function cancelActivePlayback(reason: 'cancelled' | 'replaced') {
  const playback = activePlayback;
  if (!playback) return;
  try { player?.pause(); } catch {}
  settlePlayback(playback, { completed: false, reason: 'cancelled' });
  logTts('playback-cancel-reason', { owner: playback.owner, sessionId: playback.sessionId, chunk: playback.chunk, reason });
}

function attachCompletionObserver(playback: ActivePlayback, audioPlayer: ReturnType<typeof createAudioPlayer>) {
  playback.playbackSub = audioPlayer.addListener('playbackStatusUpdate', (status: any) => {
    if (activePlayback?.id !== playback.id) return;
    if (status.didJustFinish) {
      settlePlayback(playback, { completed: true, reason: 'finished' });
      return;
    }

    const duration = Number(status.duration);
    const currentTime = Number(status.currentTime) || 0;
    if (!playback.fallbackTimer && Number.isFinite(duration) && duration > currentTime) {
      const fallbackDelayMs = Math.ceil((duration - currentTime) * 1000) + 1200;
      playback.fallbackTimer = setTimeout(() => {
        if (activePlayback?.id === playback.id) {
          settlePlayback(playback, { completed: true, reason: 'fallback' });
        }
      }, fallbackDelayMs);
    }
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(result);
}

async function startPlayback(text: string, playback: ActivePlayback) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not signed in');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`TTS error ${response.status}`);

    const audioBuffer = await response.arrayBuffer();
    if (audioBuffer.byteLength === 0) throw new Error('Received empty audio response');
    if (activePlayback?.id !== playback.id) return;

    const fileUri = `${FileSystem.cacheDirectory}tts-${playback.id}.wav`;
    await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(audioBuffer), {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (activePlayback?.id !== playback.id) return;

    const audioPlayer = ensurePlayer();
    attachCompletionObserver(playback, audioPlayer);
    audioPlayer.replace({ uri: fileUri });
    setState('playing', playback.owner, playback.sessionId);
    logTts('playback-start', { owner: playback.owner, sessionId: playback.sessionId, chunk: playback.chunk });
    audioPlayer.play();
  } catch (error) {
    if (activePlayback?.id !== playback.id) return;
    const message = error instanceof Error ? error.message : 'TTS failed';
    settlePlayback(playback, { completed: false, reason: 'error' }, message);
  }
}

export function speak(text: string, options: SpeakOptions = {}): Promise<TTSPlaybackResult> {
  const owner = options.owner || 'message';
  if (activePlayback && options.interrupt === false) {
    logTts('playback-blocked', { owner, sessionId: options.sessionId, chunk: options.chunk, activeOwner: activePlayback.owner });
    return Promise.resolve({ completed: false, reason: 'blocked' });
  }

  cancelActivePlayback('replaced');
  const id = ++nextPlaybackId;
  return new Promise((resolve) => {
    const playback: ActivePlayback = {
      id,
      owner,
      sessionId: options.sessionId,
      chunk: options.chunk,
      resolve,
      playbackSub: null,
      fallbackTimer: null,
    };
    activePlayback = playback;
    setState('loading', owner, options.sessionId);
    logTts('playback-request', { owner, sessionId: options.sessionId, chunk: options.chunk, textChars: text.length });
    void startPlayback(text, playback);
  });
}

export function stopTTS(reason = 'manual') {
  cancelActivePlayback('cancelled');
  logTts('stop', { reason });
}

export function stopTTSForOwner(owner: string, reason = 'manual') {
  if (activePlayback?.owner === owner) {
    cancelActivePlayback('cancelled');
    logTts('stop', { owner, reason });
  }
}
