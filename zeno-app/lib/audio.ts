import { createAudioPlayer } from 'expo-audio';

type AudioState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
type AudioListener = (state: AudioState, errorMsg?: string) => void;

let player: ReturnType<typeof createAudioPlayer> | null = null;
let listeners: Set<AudioListener> = new Set();
let _state: AudioState = 'idle';
let _errorMsg = '';
let playbackSub: { remove: () => void } | null = null;

function notify() {
  listeners.forEach((l) => l(_state, _errorMsg));
}

function setState(s: AudioState, err?: string) {
  _state = s;
  _errorMsg = err || '';
  notify();
}

export function subscribeToAudio(fn: AudioListener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getAudioState() {
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
  if (!player) return;
  try {
    playbackSub = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.didJustFinish) {
        stopFinishCheck();
        setState('idle');
      }
    });
  } catch {}
}

function ensurePlayer() {
  if (!player) {
    player = createAudioPlayer(null, { downloadFirst: false });
    try {
      (player as any).volume = 1.0;
    } catch {}
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

export function stopAudio(): void {
  cleanupPlayer();
  setState('idle');
}

export function pauseAudio(): void {
  if (player) {
    try { player.pause(); } catch {}
  }
  setState('paused');
}

export async function playAudio(url: string): Promise<void> {
  stopFinishCheck();
  if (player) {
    try { player.pause(); } catch {}
  }

  setState('loading');

  try {
    const p = ensurePlayer();
    if (!p) throw new Error('Failed to create audio player');

    p.replace({ uri: url });
    setState('playing');

    try {
      p.play();
    } catch (e) {
      throw new Error(`Playback failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    startFinishCheck();
  } catch (err) {
    cleanupPlayer();
    const msg = err instanceof Error ? err.message : 'Audio playback failed';
    setState('error', msg);
  }
}
