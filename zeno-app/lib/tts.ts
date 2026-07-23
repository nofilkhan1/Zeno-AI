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
let playbackSub: { remove: () => void } | null = null;

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
  if (playbackSub) {
    playbackSub.remove();
    playbackSub = null;
  }
}

function startFinishCheck() {
  stopFinishCheck();
  if (!player) {
    console.warn('[TTS] startFinishCheck: no player');
    return;
  }
  try {
    playbackSub = player.addListener('playbackStatusUpdate', (status: any) => {
      console.log('[TTS-DEBUG] 5. Playback status event: didJustFinish=' + status.didJustFinish + ' isPlaying=' + status.isPlaying + ' currentTime=' + (status as any).currentTime + ' duration=' + (status as any).duration);
      if (status.didJustFinish) {
        console.log('[TTS-DEBUG] 5. Audio playback finished (didJustFinish=true)');
        stopFinishCheck();
        setState('idle');
      }
    });
    console.log('[TTS-DEBUG] 5. Subscribed to playbackStatusUpdate event');
  } catch (e) {
    console.error('[TTS-DEBUG] 5. Failed to subscribe to playbackStatusUpdate:', e);
  }
}

function ensurePlayer() {
  if (!player) {
    console.log('[TTS] ensurePlayer: creating new player');
    player = createAudioPlayer(null, { downloadFirst: false });
    // Step 8: explicitly set volume to max (default might be 0 on some platforms)
    try {
      (player as any).volume = 1.0;
      console.log('[TTS-DEBUG] 8. Player volume set to 1.0');
    } catch (e) {
      console.error('[TTS-DEBUG] 8. Failed to set volume:', e);
    }
  } else {
    console.log('[TTS] ensurePlayer: reusing existing player');
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

    console.log('[TTS-DEBUG] 2. Fetching TTS API...');
    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
    } catch (e) {
      console.error('[TTS-DEBUG] ERROR at step 2 (API fetch):', e);
      throw e;
    }

    console.log('[TTS] Response status:', response.status);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error('[TTS-DEBUG] ERROR at step 2 (API error response):', errBody);
      throw new Error((errBody as any).error || `TTS error ${response.status}`);
    }

    let audioBuffer: ArrayBuffer;
    try {
      audioBuffer = await response.arrayBuffer();
    } catch (e) {
      console.error('[TTS-DEBUG] ERROR at step 2 (arrayBuffer()):', e);
      throw e;
    }
    console.log('[TTS-DEBUG] 2. API response status:', response.status, 'audio size:', audioBuffer.byteLength);

    if (audioBuffer.byteLength === 0) {
      throw new Error('Received empty audio response');
    }

    let fileUri: string;
    try {
      const base64 = arrayBufferToBase64(audioBuffer);
      fileUri = `${FileSystem.cacheDirectory}tts-${Date.now()}.wav`;

      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('[TTS-DEBUG] 3. Audio saved to:', fileUri);
    } catch (e) {
      console.error('[TTS-DEBUG] ERROR at step 3 (save audio to file):', e);
      throw e;
    }

    console.log('[TTS-DEBUG] 3. Loading audio into player');
    const p = ensurePlayer();
    if (!p) {
      console.error('[TTS-DEBUG] ERROR at step 3: ensurePlayer returned null');
      throw new Error('Player is null');
    }
    console.log('[TTS] Calling player.replace() with uri:', fileUri);
    try {
      p.replace({ uri: fileUri });
      console.log('[TTS-DEBUG] 3. player.replace() succeeded');
    } catch (e) {
      console.error('[TTS-DEBUG] ERROR at step 3 (player.replace()):', e);
      throw e;
    }
    setState('playing');
    console.log('[TTS-DEBUG] 4. Calling player.play()');
    try {
      const playResult = p.play();
      console.log('[TTS-DEBUG] 4. play() called, result:', playResult);
    } catch (e) {
      console.error('[TTS-DEBUG] ERROR at step 4 (player.play()):', e);
      throw e;
    }
    // Step 5: playback completion detected via playbackStatusUpdate event
    console.log('[TTS-DEBUG] 5. Subscribing to playbackStatusUpdate event');
    startFinishCheck();
  } catch (err) {
    console.error('[TTS] Error:', err);
    cleanupPlayer();
    const msg = err instanceof Error ? err.message : 'TTS failed';
    setState('error', msg);
    throw err;
  }
}
