import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
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

export async function speak(text: string): Promise<void> {
  // Stop current playback
  stopFinishCheck();
  if (player) {
    try { player.pause(); } catch {}
  }

  setState('loading');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not signed in');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error((errBody as any).error || `TTS error ${response.status}`);
    }

    // Write audio binary to cache file
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const fileUri = `${FileSystem.cacheDirectory}tts-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(fileUri, base64.split(',')[1], {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Create or reuse player
    const p = ensurePlayer();
    p.replace({ uri: fileUri });
    setState('playing');
    p.play();
    startFinishCheck();
  } catch (err) {
    cleanupPlayer();
    const msg = err instanceof Error ? err.message : 'TTS failed';
    setState('error', msg);
    throw err;
  }
}
