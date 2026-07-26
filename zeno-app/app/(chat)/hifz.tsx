import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator,
  useColorScheme, Modal, FlatList, Keyboard,
} from 'react-native';
import { BookOpen, ChevronLeft, ChevronRight, CheckCircle, RotateCcw, Eye, EyeOff, Search, RefreshCw, Bookmark, Hash } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useColors, typography, radii, softShadow } from '../../lib/theme';
import SURAHS from '../../lib/surahs';
import QuranAyahText, { formatQuranTranslation, getAyahEndMarker } from '../../components/QuranAyahText';

const LOOKUP_FN = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-lookup`;
const PROGRESS_FN = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/memorization-progress`;

type PracticeMode = 'read' | 'hide' | 'recall';

type VerseData = {
  verseKey: string;
  arabic: string;
  translation: string;
  surahName: string;
  ayah: number;
};

type ProgressEntry = {
  surah: number;
  ayah: number;
  status: 'not_started' | 'in_progress' | 'memorized';
  last_reviewed_at: string;
};

type DueItem = {
  surah: number;
  ayah: number;
  daysOverdue: number;
};

type SurahProgress = {
  memorized: number;
  total: number;
};

type ModeLabel = { key: PracticeMode; label: string; icon: string };

const MODES: ModeLabel[] = [
  { key: 'read', label: 'Read Along', icon: 'eye' },
  { key: 'hide', label: 'Progressive Hide', icon: 'eye-off' },
  { key: 'recall', label: 'Recall Test', icon: 'bookmark' },
];

export default function HifzScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const router = useRouter();

  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [currentAyah, setCurrentAyah] = useState(1);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('read');
  const [hideLevel, setHideLevel] = useState(0);
  const [recallRevealed, setRecallRevealed] = useState(false);

  const [verseData, setVerseData] = useState<VerseData | null>(null);
  const [verseLoading, setVerseLoading] = useState(false);
  const [verseError, setVerseError] = useState<string | null>(null);

  const [surahProgress, setSurahProgress] = useState<Map<number, SurahProgress>>(new Map());
  const [progressMap, setProgressMap] = useState<Map<string, ProgressEntry>>(new Map());

  const [reviewDue, setReviewDue] = useState<DueItem[]>([]);
  const [showReview, setShowReview] = useState(false);

  const [showSurahPicker, setShowSurahPicker] = useState(false);
  const [surahSearch, setSurahSearch] = useState('');

  const [markLoading, setMarkLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const ayahInputRef = useRef<TextInput>(null);

  const surahInfo = selectedSurah ? SURAHS.find((s) => s.number === selectedSurah) : null;
  const maxAyah = surahInfo?.ayahCount || 1;

  // Fetch verse data
  const fetchVerse = useCallback(async (surah: number, ayah: number) => {
    setVerseLoading(true);
    setVerseError(null);
    setHideLevel(0);
    setRecallRevealed(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(LOOKUP_FN, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ayah', surah, ayah }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setVerseData({
        verseKey: data.verseKey,
        arabic: data.arabic,
        translation: data.translation,
        surahName: data.surah?.name_english || '',
        ayah,
      });
    } catch (err) {
      setVerseError(err instanceof Error ? err.message : 'Failed to load verse');
    } finally {
      setVerseLoading(false);
    }
  }, []);

  // Fetch all progress
  const fetchAllProgress = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(PROGRESS_FN, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-all' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      const map = new Map<string, ProgressEntry>();
      const surahMap = new Map<number, SurahProgress>();
      for (const p of data.progress || []) {
        const key = `${p.surah}:${p.ayah}`;
        map.set(key, p);
        if (p.status === 'memorized') {
          const prev = surahMap.get(p.surah) || { memorized: 0, total: 0 };
          surahMap.set(p.surah, { ...prev, memorized: prev.memorized + 1 });
        }
      }
      setProgressMap(map);
      setSurahProgress(surahMap);
    } catch (err) {
      console.log('[Hifz] progress fetch error:', err);
    }
  }, []);

  // Fetch review-due
  const fetchReviewDue = useCallback(async () => {
    setReviewLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(PROGRESS_FN, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review-due', limit: 30 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      setReviewDue(data.due || []);
    } catch (err) {
      console.log('[Hifz] review due error:', err);
    } finally {
      setReviewLoading(false);
    }
  }, []);

  // Mark verse status
  const markVerse = useCallback(async (status: string) => {
    if (!selectedSurah) return;
    setMarkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(PROGRESS_FN, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', surah: selectedSurah, ayah: currentAyah, status }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      await fetchAllProgress();
      await fetchReviewDue();
    } catch (err) {
      console.log('[Hifz] mark error:', err);
    } finally {
      setMarkLoading(false);
    }
  }, [selectedSurah, currentAyah, fetchAllProgress, fetchReviewDue]);

  useEffect(() => {
    if (selectedSurah) {
      fetchVerse(selectedSurah, currentAyah);
    }
  }, [selectedSurah, currentAyah, fetchVerse]);

  useEffect(() => {
    if (selectedSurah) {
      fetchAllProgress();
      fetchReviewDue();
    }
  }, [selectedSurah, fetchAllProgress, fetchReviewDue]);

  function selectSurah(number: number) {
    setSelectedSurah(number);
    setCurrentAyah(1);
    setShowSurahPicker(false);
    setSurahSearch('');
  }

  function goPrev() {
    if (currentAyah > 1) setCurrentAyah(currentAyah - 1);
  }

  function goNext() {
    if (currentAyah < maxAyah) setCurrentAyah(currentAyah + 1);
  }

  function goToAyah(ayah: number) {
    const clamped = Math.max(1, Math.min(ayah, maxAyah));
    setCurrentAyah(clamped);
    Keyboard.dismiss();
  }

  function onModeChange(mode: PracticeMode) {
    setPracticeMode(mode);
    setHideLevel(0);
    setRecallRevealed(false);
  }

  function advanceHide() {
    if (!verseData) return;
    const words = verseData.arabic.split(/\s+/).filter(Boolean);
    if (hideLevel < words.length) {
      setHideLevel(hideLevel + 1);
    }
  }

  function resetHide() {
    setHideLevel(0);
  }

  function jumpToDue(item: DueItem) {
    setSelectedSurah(item.surah);
    setCurrentAyah(item.ayah);
    setShowReview(false);
  }

  const progressKey = selectedSurah ? `${selectedSurah}:${currentAyah}` : '';
  const currentProgress = progressMap.get(progressKey);
  const currentStatus = currentProgress?.status || 'not_started';
  const sp = selectedSurah ? surahProgress.get(selectedSurah) : null;
  const memorizedCount = sp?.memorized || 0;
  const progressPct = maxAyah > 0 ? (memorizedCount / maxAyah) * 100 : 0;

  // Render verse with progressive hide
  function renderArabic() {
    if (!verseData) return null;
    if (practiceMode === 'recall' && !recallRevealed) {
      const words = verseData.arabic.split(/\s+/).filter(Boolean);
      const hint = words[0] || '';
      return (
        <View>
          <Text style={[s.arabicTextHidden, { color: colors.textMuted }]}>
            {'▌'.repeat(Math.max(8, verseData.arabic.length / 3))}
          </Text>
          <Text style={[t.caption, { color: colors.textMuted, textAlign: 'right', marginTop: 4 }]}>
            Hint: {hint}…
          </Text>
        </View>
      );
    }
    if (practiceMode === 'hide' && hideLevel > 0) {
      const words = verseData.arabic.split(/\s+/).filter(Boolean);
      const hiddenCount = Math.min(hideLevel, words.length);
      const visibleWords = words.slice(0, words.length - hiddenCount);
      const hiddenWords = words.slice(words.length - hiddenCount);
      return (
        <Text style={[s.arabicText, { color: colors.textPrimary }]}>
          {visibleWords.join(' ')}
          {hiddenCount > 0 && (
            <Text style={{ color: scheme === 'dark' ? '#555' : '#ccc' }}>
              {' ' + hiddenWords.map(() => '██').join(' ')}
            </Text>
          )}
          {getAyahEndMarker(verseData.arabic, currentAyah)}
        </Text>
      );
    }
    return <QuranAyahText arabic={verseData.arabic} ayah={currentAyah} style={[s.arabicText, { color: colors.textPrimary }]} />;
  }

  // No surah selected state
  if (!selectedSurah) {
    return (
      <View style={[s.container, { backgroundColor: colors.bg }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={[t.title, { color: colors.textPrimary }]}>Hifz (Memorization)</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[t.caption, { color: colors.textMuted }]}>Back</Text>
          </Pressable>
        </View>

        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.composerBorder }, softShadow()]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <BookOpen size={20} color={colors.accent} />
            <Text style={[t.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
              Pick a surah to start memorizing
            </Text>
          </View>
          <View style={[s.searchRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary }]}
              placeholder="Search surah..."
              placeholderTextColor={colors.textMuted}
              value={surahSearch}
              onChangeText={setSurahSearch}
            />
          </View>
          <ScrollView style={{ maxHeight: 500 }} nestedScrollEnabled>
            {(surahSearch
              ? SURAHS.filter((s) => {
                  const q = surahSearch.toLowerCase();
                  return s.name.toLowerCase().includes(q) || s.englishName.toLowerCase().includes(q) || String(s.number).includes(q);
                })
              : SURAHS
            ).map((surah) => {
              const sp2 = surahProgress.get(surah.number);
              const memCount = sp2?.memorized || 0;
              return (
                <Pressable
                  key={surah.number}
                  style={({ pressed }) => [s.surahOption, pressed && { opacity: 0.7 }]}
                  onPress={() => selectSurah(surah.number)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={[s.surahNumBadge, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                      <Text style={[t.caption, { color: colors.textMuted, fontSize: 11 }]}>{surah.number}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>
                        {surah.number}. {surah.name}
                      </Text>
                      <Text style={[t.caption, { color: colors.textMuted }]}>
                        {surah.englishName} — {surah.ayahCount} verses
                      </Text>
                    </View>
                  </View>
                  {memCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={14} color="#16a34a" />
                      <Text style={[t.caption, { color: '#16a34a' }]}>{memCount}/{surah.ayahCount}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* ── Surah picker modal ── */}
      {showSurahPicker && (
        <SurahPickerModal
          colors={colors}
          scheme={scheme}
          t={t}
          surahSearch={surahSearch}
          setSurahSearch={setSurahSearch}
          selectedSurah={selectedSurah}
          surahProgress={surahProgress}
          onSelect={selectSurah}
          onClose={() => { setShowSurahPicker(false); setSurahSearch(''); }}
        />
      )}

      {/* ── Header: Surah info + progress ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Pressable onPress={() => setShowSurahPicker(true)} style={{ flex: 1 }}>
          <Text style={[t.heading, { color: colors.accent }]}>
            {surahInfo?.name}
          </Text>
          <Text style={[t.caption, { color: colors.textMuted }]}>
            {surahInfo?.englishName} — Surah {surahInfo?.number}
          </Text>
        </Pressable>
        <Pressable onPress={() => { setSelectedSurah(null); setSurahSearch(''); }} style={{ paddingLeft: 12 }}>
          <Text style={[t.caption, { color: colors.textMuted }]}>Change</Text>
        </Pressable>
      </View>

      {/* ── Progress bar ── */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={[t.caption, { color: colors.textMuted }]}>
            <CheckCircle size={12} color="#16a34a" /> {memorizedCount}/{maxAyah} memorized
          </Text>
          <Text style={[t.caption, { color: colors.textMuted }]}>
            {Math.round(progressPct)}%
          </Text>
        </View>
        <View style={[s.progressBar, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
          <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: '#16a34a' }]} />
        </View>
      </View>

      {/* ── Review due badge ── */}
      {reviewDue.length > 0 && (
        <Pressable
          style={[s.reviewBadge, { backgroundColor: scheme === 'dark' ? 'rgba(250,204,21,0.12)' : 'rgba(250,204,21,0.1)', borderColor: '#ca8a04' }]}
          onPress={() => setShowReview(!showReview)}
        >
          <RefreshCw size={14} color="#ca8a04" />
          <Text style={[t.caption, { color: '#ca8a04', flex: 1 }]}>
            {reviewDue.length} verse{reviewDue.length > 1 ? 's' : ''} due for review
          </Text>
          <Text style={[t.caption, { color: '#ca8a04' }]}>{showReview ? 'Hide' : 'Review'}</Text>
        </Pressable>
      )}

      {showReview && reviewDue.length > 0 && (
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: '#ca8a04', marginBottom: 12 }]}>
          <Text style={[t.captionMedium, { color: colors.textPrimary, marginBottom: 8 }]}>Verses Due for Review</Text>
          {reviewDue.map((item, i) => {
            const sInfo = SURAHS.find((s) => s.number === item.surah);
            return (
              <Pressable
                key={`${item.surah}:${item.ayah}`}
                style={({ pressed }) => [
                  s.dueRow,
                  i < reviewDue.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.composerBorder },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => jumpToDue(item)}
              >
                <Text style={[t.bodyMedium, { color: colors.accent, flex: 1 }]}>
                  {sInfo?.name || `Surah ${item.surah}`} {item.ayah}
                </Text>
                <Text style={[t.caption, { color: colors.textMuted }]}>
                  {item.daysOverdue > 0 ? `${item.daysOverdue}d overdue` : 'Due today'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── Mode tabs ── */}
      <View style={[s.modeRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            style={[s.modeTab, practiceMode === m.key && { backgroundColor: colors.accent }]}
            onPress={() => onModeChange(m.key)}
          >
            <Text style={[t.caption, { color: practiceMode === m.key ? '#fff' : colors.textMuted }]}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Ayah navigation ── */}
      <View style={[s.ayahNav, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        <Pressable onPress={goPrev} style={[s.navBtn, currentAyah <= 1 && { opacity: 0.3 }]} disabled={currentAyah <= 1}>
          <ChevronLeft size={20} color={colors.accent} />
        </Pressable>
        <Pressable onPress={() => ayahInputRef.current?.focus()} style={s.ayahCenter}>
          <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>
            {currentAyah}
            <Text style={[t.caption, { color: colors.textMuted }]}> / {maxAyah}</Text>
          </Text>
        </Pressable>
        <Pressable onPress={goNext} style={[s.navBtn, currentAyah >= maxAyah && { opacity: 0.3 }]} disabled={currentAyah >= maxAyah}>
          <ChevronRight size={20} color={colors.accent} />
        </Pressable>
      </View>

      {/* ── Verse content ── */}
      <ScrollView style={s.verseArea} contentContainerStyle={{ paddingBottom: 16 }}>
        {verseLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : verseError ? (
          <Text style={[t.caption, { color: colors.danger }]}>{verseError}</Text>
        ) : verseData ? (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
            <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 8 }]}>
              {surahInfo?.name} {currentAyah}
            </Text>

            {/* Arabic */}
            {renderArabic()}

            {practiceMode === 'recall' && !recallRevealed && (
              <Pressable
                style={[s.actionBtn, { borderColor: colors.accent, marginTop: 12, alignSelf: 'center' }]}
                onPress={() => setRecallRevealed(true)}
              >
                <Eye size={16} color={colors.accent} />
                <Text style={[t.captionMedium, { color: colors.accent }]}>Reveal Verse</Text>
              </Pressable>
            )}

            <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />

            {/* Translation */}
            <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>
              {formatQuranTranslation(verseData.translation)}
            </Text>

            {/* Progressive hide controls */}
            {practiceMode === 'hide' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pressable style={[s.actionBtn, { borderColor: colors.accent, flex: 1 }]} onPress={advanceHide}>
                  <EyeOff size={16} color={colors.accent} />
                  <Text style={[t.captionMedium, { color: colors.accent }]}>Hide More</Text>
                </Pressable>
                {hideLevel > 0 && (
                  <Pressable style={[s.actionBtn, { borderColor: colors.composerBorder }]} onPress={resetHide}>
                    <RotateCcw size={16} color={colors.textMuted} />
                    <Text style={[t.captionMedium, { color: colors.textMuted }]}>Reset</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Status actions ── */}
      <View style={[s.statusRow, { borderTopColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        {currentStatus === 'memorized' ? (
          <Pressable
            style={[s.statusBtn, { borderColor: colors.danger }]}
            onPress={() => markVerse('in_progress')}
            disabled={markLoading}
          >
            <RotateCcw size={16} color={colors.danger} />
            <Text style={[t.captionMedium, { color: colors.danger }]}>Reset</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[s.statusBtn, { borderColor: '#16a34a' }]}
            onPress={() => markVerse('memorized')}
            disabled={markLoading}
          >
            {markLoading ? (
              <ActivityIndicator size="small" color="#16a34a" />
            ) : (
              <CheckCircle size={16} color="#16a34a" />
            )}
            <Text style={[t.captionMedium, { color: '#16a34a' }]}>I Know This ✓</Text>
          </Pressable>
        )}

        <Pressable
          style={[s.statusBtn, { borderColor: colors.composerBorder }]}
          onPress={goNext}
          disabled={currentAyah >= maxAyah}
        >
          <Text style={[t.captionMedium, { color: colors.textMuted }]}>Next</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      </View>

    </View>
  );
}

function SurahPickerModal({
  colors, scheme, t, surahSearch, setSurahSearch, selectedSurah, surahProgress, onSelect, onClose,
}: {
  colors: ReturnType<typeof useColors>;
  scheme: ReturnType<typeof useColorScheme>;
  t: ReturnType<typeof typography>;
  surahSearch: string;
  setSurahSearch: (v: string) => void;
  selectedSurah: number | null;
  surahProgress: Map<number, SurahProgress>;
  onSelect: (n: number) => void;
  onClose: () => void;
}) {
  const filtered = SURAHS.filter((s) => {
    if (!surahSearch) return true;
    const q = surahSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.englishName.toLowerCase().includes(q) || String(s.number).includes(q);
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <View style={[s.sheet, { backgroundColor: colors.bg, borderColor: colors.composerBorder }]} onStartShouldSetResponder={() => true}>
          <View style={[s.searchRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={[s.searchInput, { color: colors.textPrimary }]}
              placeholder="Search surah..."
              placeholderTextColor={colors.textMuted}
              value={surahSearch}
              onChangeText={setSurahSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.number)}
            style={{ maxHeight: 400 }}
            renderItem={({ item }) => {
              const sp2 = surahProgress.get(item.number);
              const memCount = sp2?.memorized || 0;
              const isSelected = selectedSurah === item.number;
              return (
                <Pressable
                  style={({ pressed }) => [
                    s.surahOption,
                    isSelected && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => onSelect(item.number)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={[s.surahNumBadge, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                      <Text style={[t.caption, { color: colors.textMuted, fontSize: 11 }]}>{item.number}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.bodyMedium, { color: isSelected ? colors.accent : colors.textPrimary }]}>
                        {item.number}. {item.name}
                      </Text>
                      <Text style={[t.caption, { color: colors.textMuted }]}>{item.englishName} — {item.ayahCount} verses</Text>
                    </View>
                  </View>
                  {memCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={14} color="#16a34a" />
                      <Text style={[t.caption, { color: '#16a34a' }]}>{memCount}</Text>
                    </View>
                  )}
                  {isSelected && <CheckCircle size={18} color={colors.accent} style={{ marginLeft: 8 }} />}
                </Pressable>
              );
            }}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderRadius: radii.lg, paddingVertical: 16, paddingHorizontal: 8, width: '85%', maxHeight: '75%', borderWidth: 1, overflow: 'hidden' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginHorizontal: 8, marginBottom: 8,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  surahOption: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: radii.sm, marginVertical: 1, minHeight: 48,
  },
  surahNumBadge: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  card: {
    borderRadius: radii.md, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  progressBar: {
    height: 6, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 3,
  },
  reviewBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.sm, borderWidth: 1, marginBottom: 12,
  },
  dueRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
  },
  modeRow: {
    flexDirection: 'row', gap: 4,
    borderRadius: radii.sm, borderWidth: 1, padding: 3, marginBottom: 8,
  },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: radii.sm - 2,
  },
  ayahNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8,
  },
  navBtn: { padding: 8 },
  ayahCenter: { alignItems: 'center', paddingHorizontal: 16 },
  verseArea: { flex: 1 },
  arabicText: {
    fontFamily: 'Inter_400Regular', fontSize: 22, lineHeight: 40,
    textAlign: 'right', writingDirection: 'rtl',
  },
  arabicTextHidden: {
    fontFamily: 'Inter_400Regular', fontSize: 22, lineHeight: 40,
    textAlign: 'right', letterSpacing: 4,
  },
  divider: { height: 1, marginVertical: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.sm, borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 1, marginTop: 8,
  },
  statusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: radii.sm, borderWidth: 1,
  },
});
