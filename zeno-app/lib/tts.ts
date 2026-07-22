import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type TTSState = 'idle' | 'loading' | 'playing' | 'error';
type TTSListener = (state: TTSState, errorMsg?: string) => void;

let player: ReturnType<typeof createAudioPlayer> | null = null;
let listeners: Set<TTSListener> = new Set();
let _state: TTSState = 'idle';
let _errorMsg = '';
let finishCheckTimer: ReturnType<typeof setInterval> | null = null;

function notify() {
  listeners.forEach((l) => l(_state, _errorMsg));
}

function setState(s: TTSState, err?: string) {
  _state = s;
  _errorMsg = err || '';
  notify();
}

export function subscribeToTTS(fn: TTSListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTTSState() {
  return { state: _state, error: _errorMsg };
}

function stopFinishCheck() {
  if (finishCheckTimer) {
    clearInterval(finishCheckTimer);
    finishCheckTimer = null;
  }
}

function startFinishCheck() {
  stopFinishCheck();
  finishCheckTimer = setInterval(() => {
    if (!player) {
      stopFinishCheck();
      return;
    }
    try {
      if (player.currentStatus.didJustFinish) {
        stopFinishCheck();
        cleanupPlayer();
        setState('idle');
      }
    } catch {
      stopFinishCheck();
    }
  }, 300);
}

function ensurePlayer() {
  if (!player) {
    player = createAudioPlayer(null, { downloadFirst: false });
  }
  return player;
}

function cleanupPlayer() {
  stopFinishCheck();
  if (player) {
    try { player.pause(); } catch {}
    try { (player as any).release?.(); } catch {}
    player = null;
  }
}

export function stopTTS(): void {
  cleanupPlayer();
  setState('idle');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode(...chunk);
  }
  return btoa(result);
}

export async function speak(text: string): Promise<void> {
  stopFinishCheck();
  if (player) {
    try { player.pause(); } catch {}
  }

  setState('loading');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not signed in');

    console.log('[TTS] Fetching audio for text:', text.slice(0, 80));

    const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    console.log('[TTS] Response status:', response.status);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error('[TTS] Error response:', errBody);
      throw new Error((errBody as any).error || `TTS error ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log('[TTS] Received audio bytes:', audioBuffer.byteLength);

    if (audioBuffer.byteLength === 0) {
      throw new Error('Received empty audio response');
    }

    const base64 = arrayBufferToBase64(audioBuffer);
    const fileUri = `${FileSystem.cacheDirectory}tts-${Date.now()}.wav`;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('[TTS] Audio saved to:', fileUri);

    const p = ensurePlayer();
    p.replace({ uri: fileUri });
    setState('playing');
    p.play();
    startFinishCheck();
  } catch (err) {
    console.error('[TTS] Error:', err);
    cleanupPlayer();
    const msg = err instanceof Error ? err.message : 'TTS failed';
    setState('error', msg);
    throw err;
  }
}
