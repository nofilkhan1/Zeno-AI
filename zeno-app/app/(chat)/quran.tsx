import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, useColorScheme, Keyboard } from 'react-native';
import { Search, BookOpen, AlertCircle, HelpCircle, Volume2, Library, Hash } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useColors, typography, radii, softShadow } from '../../lib/theme';
import QuranAudioPlayer from '../../components/QuranAudioPlayer';

const LOOKUP_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-lookup`;
const ANSWER_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-answer`;
const HADITH_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/hadith-search`;

const SEARCH_LANGUAGES = [
  { key: 'sahih_international', label: 'English (Sahih)' },
  { key: 'pickthall', label: 'English (Pickthall)' },
  { key: 'yusuf_ali', label: 'English (Yusuf Ali)' },
  { key: 'urdu', label: 'Urdu' },
  { key: 'indonesian', label: 'Indonesian' },
  { key: 'french', label: 'French' },
  { key: 'german', label: 'German' },
  { key: 'bengali', label: 'Bengali' },
  { key: 'spanish', label: 'Spanish' },
];

const HADITH_COLLECTIONS = [
  { key: '', label: 'All Collections' },
  { key: 'bukhari', label: 'Bukhari' },
  { key: 'muslim', label: 'Muslim' },
  { key: 'abudawud', label: 'Abu Dawud' },
  { key: 'tirmidhi', label: 'Tirmidhi' },
  { key: 'ibnmajah', label: 'Ibn Majah' },
  { key: 'nasai', label: "Nasai" },
  { key: 'malik', label: 'Malik' },
];

type Mode = 'quran' | 'hadith';

type QuranResult = {
  surah?: { number: number; name_english: string; name_translation: string };
  arabic: string;
  transliteration?: string;
  translation: string;
  translationKey?: string;
  verseKey: string;
};

type SearchResult = {
  verseKey: string;
  surahNumber: number;
  surahName: string;
  ayah: number;
  arabic: string;
  translation: string;
  translationSource: string;
};

type HadithResult = {
  id: string;
  collection: string;
  collectionName: string;
  hadithNumber: number;
  arabic?: string;
  english: string;
  grade: string;
};

type TafsirResult = {
  key: string;
  name: string;
  author: string;
  text: string;
};

type TafsirResponse = {
  source: string;
  author: string;
  text: string;
};

type ConfidenceLevel = 'green' | 'yellow' | 'orange' | 'red';

const TAFSIR_SOURCES = [
  { key: 'ibn_kathir', label: 'Ibn Kathir (Abridged)', author: 'Hafiz Ibn Kathir' },
  { key: 'maarif', label: "Ma'arif al-Qur'an", author: 'Mufti Muhammad Shafi' },
  { key: 'muyassar', label: 'Tafsir Muyassar', author: 'Ministry of Islamic Affairs, Saudi Arabia' },
];

const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; color: string; darkColor: string }> = {
  green: { label: 'Direct Evidence', color: '#16a34a', darkColor: '#4ade80' },
  yellow: { label: 'General Understanding', color: '#ca8a04', darkColor: '#facc15' },
  orange: { label: 'Limited Evidence', color: '#ea580c', darkColor: '#fb923c' },
  red: { label: 'No Clear Evidence', color: '#dc2626', darkColor: '#f87171' },
};

function isQuestion(input: string): boolean {
  const trimmed = input.trim();
  if (/^\d+\s*[:.]\s*\d+$/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  const questionStarts = ['what', 'why', 'how', 'does', 'do', 'is', 'are', 'can', 'should', 'would', 'could', 'tell', 'explain'];
  const startsWithQW = questionStarts.some((w) => lower.startsWith(w));
  if (startsWithQW) return true;
  const words = trimmed.split(/\s+/);
  return words.length >= 4;
}

export default function QuranScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const [mode, setMode] = useState<Mode>('quran');
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('sahih_international');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ayahResult, setAyahResult] = useState<QuranResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const [tafsir, setTafsir] = useState<TafsirResult | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirSource, setTafsirSource] = useState('ibn_kathir');
  const [tafsirExpanded, setTafsirExpanded] = useState(false);
  const [tafsirError, setTafsirError] = useState<string | null>(null);

  const [answer, setAnswer] = useState<string | null>(null);
  const [answerConfidence, setAnswerConfidence] = useState<ConfidenceLevel | null>(null);
  const [answerQuranVerses, setAnswerQuranVerses] = useState<SearchResult[]>([]);
  const [answerHadiths, setAnswerHadiths] = useState<HadithResult[]>([]);
  const [answerTafsir, setAnswerTafsir] = useState<TafsirResponse | null>(null);
  const [noResults, setNoResults] = useState(false);

  const [hadithResults, setHadithResults] = useState<HadithResult[] | null>(null);
  const [hadithCollection, setHadithCollection] = useState('');
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [hadithTotalFound, setHadithTotalFound] = useState(0);

  function resetAll() {
    setAyahResult(null);
    setSearchResults(null);
    setError(null);
    setAnswer(null);
    setAnswerConfidence(null);
    setAnswerQuranVerses([]);
    setAnswerHadiths([]);
    setAnswerTafsir(null);
    setTafsir(null);
    setTafsirExpanded(false);
    setTafsirError(null);
    setNoResults(false);
    setHadithResults(null);
  }

  async function handleAyahOrSearch(body: unknown) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(LOOKUP_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function handleHadithSearch(query: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(HADITH_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, collection: hadithCollection || undefined, limit: 15 }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function fetchTafsirForVerse(surah: number, ayah: number, source: string) {
    setTafsirLoading(true);
    setTafsirError(null);
    setTafsir(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(LOOKUP_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'tafsir', surah, ayah, source }),
      });
      if (res.status === 404) {
        setTafsirError('Tafsir not available for this verse.');
        return;
      }
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setTafsir(data.tafsir as TafsirResult);
    } catch (err) {
      setTafsirError(err instanceof Error ? err.message : 'Failed to load tafsir');
    } finally {
      setTafsirLoading(false);
    }
  }

  async function handleQuestion(question: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(ANSWER_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, translation: language }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setLoading(true);
    resetAll();

    try {
      if (mode === 'hadith') {
        const data = await handleHadithSearch(trimmed);
        setHadithResults(data.hadiths || []);
        setHadithTotalFound(data.totalFound || 0);
        if ((data.hadiths || []).length === 0) {
          setNoResults(true);
        }
      } else {
        const questionMode = isQuestion(trimmed);

        if (questionMode) {
          const data = await handleQuestion(trimmed);
          if (data.noResults) {
            setNoResults(true);
          } else {
            setAnswer(data.answer);
            setAnswerConfidence((data.confidence as ConfidenceLevel) || 'red');
            setAnswerQuranVerses(data.quranVerses || []);
            setAnswerHadiths(data.hadiths || []);
            setAnswerTafsir(data.tafsir || null);
            if (data.error && !data.answer) {
              setAnswer(null);
              setError(data.error);
            }
          }
        } else {
          const ayahMatch = trimmed.match(/^(\d+)\s*[:.]\s*(\d+)$/);
          const body = ayahMatch
            ? { type: 'ayah', surah: parseInt(ayahMatch[1]), ayah: parseInt(ayahMatch[2]), translation: language }
            : { type: 'search', query: trimmed, translation: language, limit: 10 };
          const data = await handleAyahOrSearch(body);
          if (ayahMatch) {
            setAyahResult(data as QuranResult);
          } else {
            setSearchResults(data.results as SearchResult[]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const currentLangLabel = SEARCH_LANGUAGES.find((l) => l.key === language)?.label || 'English (Sahih)';
  const confidenceMeta = answerConfidence ? CONFIDENCE_META[answerConfidence] : null;
  const currentCollectionLabel = HADITH_COLLECTIONS.find((c) => c.key === hadithCollection)?.label || 'All Collections';

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* ── Mode switcher ── */}
      <View style={[s.modeRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        <Pressable
          style={[s.modeTab, mode === 'quran' && { backgroundColor: colors.accent }]}
          onPress={() => { setMode('quran'); resetAll(); }}
        >
          <BookOpen size={14} color={mode === 'quran' ? '#fff' : colors.textMuted} />
          <Text style={[t.caption, { color: mode === 'quran' ? '#fff' : colors.textMuted }]}>Quran</Text>
        </Pressable>
        <Pressable
          style={[s.modeTab, mode === 'hadith' && { backgroundColor: colors.accent }]}
          onPress={() => { setMode('hadith'); resetAll(); }}
        >
          <Library size={14} color={mode === 'hadith' ? '#fff' : colors.textMuted} />
          <Text style={[t.caption, { color: mode === 'hadith' ? '#fff' : colors.textMuted }]}>Hadith</Text>
        </Pressable>
      </View>

      {/* ── Input row ── */}
      <View style={[s.inputRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        {mode === 'hadith' ? (
          <Hash size={18} color={colors.textMuted} />
        ) : isQuestion(input) ? (
          <HelpCircle size={18} color={colors.textMuted} />
        ) : (
          <Search size={18} color={colors.textMuted} />
        )}
        <TextInput
          style={[s.input, { color: colors.textPrimary }]}
          placeholder={mode === 'hadith' ? "Search hadith (e.g. patience, charity)..." : "Verse (2:255), search, or ask..."}
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
        />
      </View>

      <View style={s.langRow}>
        {mode === 'hadith' ? (
          <Pressable
            style={[s.langButton, { borderColor: colors.composerBorder }]}
            onPress={() => setShowCollectionPicker(!showCollectionPicker)}
          >
            <Library size={14} color={colors.accent} />
            <Text style={[t.caption, { color: colors.textMuted }]}>{currentCollectionLabel}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[s.langButton, { borderColor: colors.composerBorder }]}
            onPress={() => setShowLangPicker(!showLangPicker)}
          >
            <BookOpen size={14} color={colors.accent} />
            <Text style={[t.caption, { color: colors.textMuted }]}>{currentLangLabel}</Text>
          </Pressable>
        )}
        <Pressable
          style={[s.submitBtn, { backgroundColor: colors.accent }, (!input.trim() || loading) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={!input.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[t.bodyMedium, { color: '#fff' }]}>Go</Text>
          )}
        </Pressable>
      </View>

      {mode === 'hadith' && showCollectionPicker && (
        <View style={[s.langPicker, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <ScrollView style={{ maxHeight: 200 }}>
            {HADITH_COLLECTIONS.map((col) => (
              <Pressable
                key={col.key}
                style={({ pressed }) => [
                  s.langOption,
                  hadithCollection === col.key && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { setHadithCollection(col.key); setShowCollectionPicker(false); }}
              >
                <Text style={[t.bodyMedium, { color: hadithCollection === col.key ? colors.accent : colors.textPrimary }]}>
                  {col.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {mode === 'quran' && showLangPicker && (
        <View style={[s.langPicker, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <ScrollView style={{ maxHeight: 200 }}>
            {SEARCH_LANGUAGES.map((lang) => (
              <Pressable
                key={lang.key}
                style={({ pressed }) => [
                  s.langOption,
                  language === lang.key && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { setLanguage(lang.key); setShowLangPicker(false); }}
              >
                <Text style={[t.bodyMedium, { color: language === lang.key ? colors.accent : colors.textPrimary }]}>
                  {lang.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {error && (
        <View style={[s.errorBox, { backgroundColor: scheme === 'dark' ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', borderColor: colors.danger }]}>
          <AlertCircle size={16} color={colors.danger} />
          <Text style={[t.caption, { color: colors.danger, flex: 1 }]}>{error}</Text>
        </View>
      )}

      <ScrollView style={s.results} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ══════════════ HADITH RESULTS ══════════════ */}
        {mode === 'hadith' && hadithResults && hadithResults.length === 0 && !loading && (
          <View style={s.empty}>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center' }]}>
              {noResults ? 'No hadith found for this topic. Try different keywords.' : ''}
            </Text>
          </View>
        )}

        {mode === 'hadith' && hadithResults && hadithResults.length > 0 && (
          <>
            <Text style={[t.caption, { marginBottom: 8, paddingHorizontal: 4 }]}>
              {hadithTotalFound > hadithResults.length ? `Showing ${hadithResults.length} of ${hadithTotalFound} results` : `${hadithResults.length} result${hadithResults.length !== 1 ? 's' : ''}`}
            </Text>
            {hadithResults.map((h) => (
              <View key={h.id} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                <View style={s.hadithHeader}>
                  <Text style={[t.captionMedium, { color: colors.accent, flex: 1 }]}>
                    {h.collectionName} #{h.hadithNumber}
                  </Text>
                  <View style={[
                    s.gradeBadge,
                    {
                      backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      borderColor: h.grade?.toLowerCase().includes('sahih') ? '#16a34a' : colors.composerBorder,
                    },
                  ]}>
                    <Text style={[
                      t.caption,
                      {
                        fontSize: 11,
                        color: h.grade?.toLowerCase().includes('sahih') ? '#16a34a' : colors.textMuted,
                      },
                    ]}>{h.grade}</Text>
                  </View>
                </View>
                <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{h.english}</Text>
                {h.arabic && (
                  <Text style={[s.arabicTextSmall, { color: colors.textPrimary, marginTop: 12 }]}>{h.arabic}</Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* ══════════════ QURAN MODE ══════════════ */}

        {/* ── Ayah result ── */}
        {mode === 'quran' && ayahResult && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
            <View style={s.resultHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                  {ayahResult.surah?.name_english} ({ayahResult.surah?.name_translation})
                </Text>
                <Text style={[t.caption, { marginBottom: 4 }]}>{ayahResult.verseKey}</Text>
              </View>
              {ayahResult.verseKey && (() => {
                const parts = ayahResult.verseKey.split(':');
                const sNum = parseInt(parts[0]);
                const aNum = parseInt(parts[1]);
                if (sNum && aNum) {
                  return <QuranAudioPlayer surah={sNum} ayah={aNum} verseKey={ayahResult.verseKey} />;
                }
                return null;
              })()}
            </View>
            <Text style={[s.arabicText, { color: colors.textPrimary }]}>{ayahResult.arabic}</Text>
            {ayahResult.transliteration && (
              <Text style={[t.caption, { fontStyle: 'italic', marginTop: 12 }]}>{ayahResult.transliteration}</Text>
            )}
            <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
            <Text style={[t.body, { color: colors.textPrimary }]}>{ayahResult.translation}</Text>

            {/* Tafsir toggle */}
            <Pressable
              style={[s.tafsirToggle, { borderColor: colors.composerBorder }]}
              onPress={() => {
                setTafsirExpanded(!tafsirExpanded);
                if (!tafsirExpanded && !tafsir && !tafsirError) {
                  const parts = ayahResult.verseKey.split(':');
                  fetchTafsirForVerse(parseInt(parts[0]), parseInt(parts[1]), tafsirSource);
                }
              }}
            >
              <BookOpen size={14} color={colors.accent} />
              <Text style={[t.captionMedium, { color: colors.accent }]}>
                {tafsirExpanded ? 'Hide Tafsir' : 'View Tafsir'}
              </Text>
            </Pressable>

            {tafsirExpanded && (
              <View style={{ marginTop: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {TAFSIR_SOURCES.map((src) => (
                    <Pressable
                      key={src.key}
                      style={[
                        s.tafsirSourceBtn,
                        {
                          backgroundColor: tafsirSource === src.key
                            ? (scheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)')
                            : 'transparent',
                          borderColor: tafsirSource === src.key ? colors.accent : colors.composerBorder,
                        },
                      ]}
                      onPress={() => {
                        setTafsirSource(src.key);
                        const parts = ayahResult.verseKey.split(':');
                        fetchTafsirForVerse(parseInt(parts[0]), parseInt(parts[1]), src.key);
                      }}
                    >
                      <Text style={[t.caption, { color: tafsirSource === src.key ? colors.accent : colors.textMuted }]}>
                        {src.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {tafsirLoading && <ActivityIndicator size="small" color={colors.accent} />}

                {tafsirError && (
                  <Text style={[t.caption, { color: colors.danger }]}>{tafsirError}</Text>
                )}

                {tafsir && (
                  <>
                    <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                      {tafsir.name} says:
                    </Text>
                    <Text style={[t.caption, { color: colors.textMuted, marginBottom: 8 }]}>
                      {tafsir.author}
                    </Text>
                    <ScrollView style={{ maxHeight: 300 }}>
                      <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>
                        {tafsir.text}
                      </Text>
                    </ScrollView>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Search results ── */}
        {mode === 'quran' && searchResults && searchResults.length === 0 && (
          <View style={s.empty}>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center' }]}>No results found.</Text>
          </View>
        )}

        {mode === 'quran' && searchResults && searchResults.length > 0 && (
          <>
            <Text style={[t.caption, { marginBottom: 8, paddingHorizontal: 4 }]}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </Text>
            {searchResults.map((r, i) => (
              <View key={r.verseKey} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                <View style={s.resultHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                      {r.surahName} {r.verseKey}
                    </Text>
                  </View>
                  <QuranAudioPlayer surah={r.surahNumber} ayah={r.ayah} verseKey={r.verseKey} />
                </View>
                <Text style={[s.arabicText, { color: colors.textPrimary }]}>{r.arabic}</Text>
                {r.translation && (
                  <>
                    <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
                    <Text style={[t.body, { color: colors.textPrimary }]}>{r.translation}</Text>
                    <Text style={[t.caption, { marginTop: 4 }]}>{r.translationSource}</Text>
                  </>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── Question / Answer mode ── */}
        {mode === 'quran' && noResults && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', lineHeight: 22 }]}>
              No directly relevant Quranic verses or hadith were found for your question. Try rephrasing with different keywords.
            </Text>
          </View>
        )}

        {mode === 'quran' && (answerQuranVerses.length > 0 || answerHadiths.length > 0) ? (
          <>
            {answer && confidenceMeta && (
              <>
                <View style={s.confidenceRow}>
                  <View style={[s.confidenceDot, { backgroundColor: scheme === 'dark' ? confidenceMeta.darkColor : confidenceMeta.color }]} />
                  <Text style={[t.captionMedium, { color: scheme === 'dark' ? confidenceMeta.darkColor : confidenceMeta.color }]}>
                    {confidenceMeta.label}
                  </Text>
                </View>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                  <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{answer}</Text>
                </View>
              </>
            )}

            {answerQuranVerses.length > 0 && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Quran Verses Referenced
                </Text>
                {answerQuranVerses.map((v, i) => (
                  <View key={v.verseKey} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                    <View style={s.resultHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                          {v.surahName} {v.verseKey}
                        </Text>
                      </View>
                      <QuranAudioPlayer surah={v.surahNumber} ayah={v.ayah} verseKey={v.verseKey} />
                    </View>
                    <Text style={[s.arabicText, { color: colors.textPrimary }]}>{v.arabic}</Text>
                    <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
                    <Text style={[t.body, { color: colors.textPrimary }]}>{v.translation}</Text>
                    <Text style={[t.caption, { marginTop: 4 }]}>{v.translationSource}</Text>
                  </View>
                ))}
              </>
            )}

            {answerHadiths.length > 0 && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Hadith Referenced
                </Text>
                {answerHadiths.map((h) => (
                  <View key={`${h.collection}-${h.hadithNumber}`} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                    <View style={s.hadithHeader}>
                      <Text style={[t.captionMedium, { color: colors.accent, flex: 1 }]}>
                        {h.collectionName} #{h.hadithNumber}
                      </Text>
                      <View style={[s.gradeBadge, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[t.caption, { color: colors.textMuted, fontSize: 11 }]}>{h.grade}</Text>
                      </View>
                    </View>
                    <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{h.english}</Text>
                    {h.arabic && (
                      <Text style={[s.arabicText, { color: colors.textPrimary, marginTop: 12 }]}>{h.arabic}</Text>
                    )}
                  </View>
                ))}
              </>
            )}

            {answerTafsir && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Scholarly Explanation
                </Text>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                  <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 2 }]}>
                    Tafsir {answerTafsir.source}
                  </Text>
                  <Text style={[t.caption, { color: colors.textMuted, marginBottom: 10 }]}>
                    {answerTafsir.author}
                  </Text>
                  <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>
                    {answerTafsir.text}
                  </Text>
                </View>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  modeRow: {
    flexDirection: 'row', gap: 4,
    borderRadius: radii.sm, borderWidth: 1, padding: 3, marginBottom: 8,
  },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: radii.sm - 2,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
  },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16 },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  langButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: radii.sm, borderWidth: 1,
  },
  submitBtn: {
    paddingVertical: 8, paddingHorizontal: 24, borderRadius: radii.sm,
    alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 36,
  },
  langPicker: {
    marginTop: 4, borderRadius: radii.sm, borderWidth: 1, overflow: 'hidden',
  },
  langOption: {
    paddingVertical: 10, paddingHorizontal: 14,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: radii.sm, borderWidth: 1, marginTop: 8,
  },
  results: { flex: 1, marginTop: 12 },
  card: {
    borderRadius: radii.md, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  resultHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 8,
  },
  arabicText: {
    fontFamily: 'Inter_400Regular', fontSize: 22, lineHeight: 40,
    textAlign: 'right', writingDirection: 'rtl',
  },
  arabicTextSmall: {
    fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 32,
    textAlign: 'right', writingDirection: 'rtl',
  },
  divider: { height: 1, marginVertical: 12 },
  empty: { paddingVertical: 40, alignItems: 'center' },
  confidenceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, paddingHorizontal: 4,
  },
  confidenceDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  hadithHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  gradeBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  tafsirToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radii.sm, borderWidth: 1, alignSelf: 'flex-start',
  },
  tafsirSourceBtn: {
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: radii.sm, borderWidth: 1, marginRight: 6,
  },
});
