import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal, ScrollView, useColorScheme } from 'react-native';
import { Play, Pause, Loader, ChevronDown } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useColors, typography, radii } from '../lib/theme';
import { playAudio, pauseAudio, stopAudio, subscribeToAudio, getAudioState } from '../lib/audio';

const AUDIO_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-audio`;

type Reciter = {
  id: number;
  name: string;
  style: string;
  audioUrl: string;
};

type Props = {
  surah: number;
  ayah: number;
  verseKey: string;
  size?: 'small' | 'default';
};

export default function QuranAudioPlayer({ surah, ayah, verseKey, size = 'small' }: Props) {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [localState, setLocalState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const unsub = subscribeToAudio((state, err) => {
      if (mountedRef.current) {
        setLocalState(state);
        if (err) setErrorMsg(err);
      }
    });
    return unsub;
  }, []);

  const fetchReciters = useCallback(async () => {
    if (fetching || reciters.length > 0) return;
    setFetching(true);
    setFetchError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(AUDIO_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ surah, ayah }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      const valid = (data.reciters || []).filter((r: Reciter) => r.audioUrl);
      if (valid.length === 0) throw new Error('No audio available for this verse');
      setReciters(valid);
      if (!selectedReciter && valid.length > 0) {
        setSelectedReciter(valid[0]);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load audio');
    } finally {
      setFetching(false);
    }
  }, [surah, ayah, fetching, reciters.length, selectedReciter]);

  async function handlePlay() {
    if (reciters.length === 0) {
      await fetchReciters();
    }
    if (reciters.length > 0 && !selectedReciter) {
      setSelectedReciter(reciters[0]);
    }
    if (!selectedReciter || !selectedReciter.audioUrl) return;
    await playAudio(selectedReciter.audioUrl);
  }

  function handlePause() {
    pauseAudio();
  }

  function handleStop() {
    stopAudio();
  }

  function handleToggle() {
    if (localState === 'playing' || localState === 'paused') {
      handlePause();
    } else {
      handlePlay();
    }
  }

  function selectReciter(r: Reciter) {
    setSelectedReciter(r);
    setShowPicker(false);
    stopAudio();
  }

  const isActive = localState === 'playing' || localState === 'loading' || localState === 'paused';
  const isThisPlaying = localState === 'playing' && selectedReciter != null;
  const isThisPaused = localState === 'paused' && selectedReciter != null;
  const iconSize = size === 'small' ? 16 : 20;

  return (
    <View style={s.wrapper}>
      <Pressable
        style={({ pressed }) => [
          s.playBtn,
          {
            backgroundColor: isThisPlaying ? colors.accent : (scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
            borderColor: isThisPlaying ? colors.accent : colors.composerBorder,
          },
          pressed && { opacity: 0.7 },
        ]}
        onPress={handleToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {localState === 'loading' ? (
          <ActivityIndicator size={iconSize <= 16 ? 'small' : 'small'} color={colors.accent} />
        ) : isThisPlaying ? (
          <Pause size={iconSize} color="#fff" />
        ) : (
          <Play size={iconSize} color={colors.accent} />
        )}
      </Pressable>

      {reciters.length > 1 && (
        <Pressable
          style={[s.reciterLabel, { borderColor: colors.composerBorder }]}
          onPress={() => { setShowPicker(true); if (reciters.length === 0) fetchReciters(); }}
        >
          <Text style={[t.caption, { fontSize: 10, color: colors.textMuted }]} numberOfLines={1}>
            {selectedReciter?.name?.split(' ').slice(-2).join(' ') || 'Reciter'}
          </Text>
          <ChevronDown size={10} color={colors.textMuted} />
        </Pressable>
      )}

      {fetchError && (
        <Text style={[t.caption, { color: colors.danger, fontSize: 10, marginLeft: 4 }]}>{fetchError}</Text>
      )}

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowPicker(false)}>
          <Pressable style={[s.pickerSheet, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <Text style={[t.captionMedium, { color: colors.textPrimary, marginBottom: 12 }]}>
              Select Reciter — {verseKey}
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {reciters.map((r) => (
                <Pressable
                  key={r.id}
                  style={({ pressed }) => [
                    s.pickerOption,
                    {
                      backgroundColor: selectedReciter?.id === r.id
                        ? (scheme === 'dark' ? 'rgba(217,119,87,0.15)' : 'rgba(217,119,87,0.1)')
                        : 'transparent',
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => selectReciter(r)}
                >
                  <Text style={[
                    t.bodyMedium,
                    { color: selectedReciter?.id === r.id ? colors.accent : colors.textPrimary },
                  ]}>
                    {r.name}
                  </Text>
                  <Text style={[t.caption, { color: colors.textMuted, fontSize: 11 }]}>{r.style}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  reciterLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  overlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, padding: 20, paddingBottom: 40,
  },
  pickerOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, marginBottom: 4,
  },
});
