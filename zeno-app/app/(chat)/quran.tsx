import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, useColorScheme, Keyboard } from 'react-native';
import { Search, BookOpen, AlertCircle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useColors, typography, radii, softShadow } from '../../lib/theme';

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-lookup`;

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

export default function QuranScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('sahih_international');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ayahResult, setAyahResult] = useState<QuranResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    setAyahResult(null);
    setSearchResults(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const ayahMatch = trimmed.match(/^(\d+)\s*[:.]\s*(\d+)$/);

      const body = ayahMatch
        ? { type: 'ayah', surah: parseInt(ayahMatch[1]), ayah: parseInt(ayahMatch[2]), translation: language }
        : { type: 'search', query: trimmed, translation: language, limit: 10 };

      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

      if (ayahMatch) {
        setAyahResult(data as QuranResult);
      } else {
        setSearchResults(data.results as SearchResult[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const currentLangLabel = SEARCH_LANGUAGES.find((l) => l.key === language)?.label || 'English (Sahih)';

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={[s.inputRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          style={[s.input, { color: colors.textPrimary }]}
          placeholder="Verse (2:255) or search..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
        />
      </View>

      <View style={s.langRow}>
        <Pressable
          style={[s.langButton, { borderColor: colors.composerBorder }]}
          onPress={() => setShowLangPicker(!showLangPicker)}
        >
          <BookOpen size={14} color={colors.accent} />
          <Text style={[t.caption, { color: colors.textMuted }]}>{currentLangLabel}</Text>
        </Pressable>
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

      {showLangPicker && (
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
        {ayahResult && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
            <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
              {ayahResult.surah?.name_english} ({ayahResult.surah?.name_translation})
            </Text>
            <Text style={[t.caption, { marginBottom: 12 }]}>{ayahResult.verseKey}</Text>
            <Text style={[s.arabicText, { color: colors.textPrimary }]}>{ayahResult.arabic}</Text>
            {ayahResult.transliteration && (
              <Text style={[t.caption, { fontStyle: 'italic', marginTop: 12 }]}>{ayahResult.transliteration}</Text>
            )}
            <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
            <Text style={[t.body, { color: colors.textPrimary }]}>{ayahResult.translation}</Text>
          </View>
        )}

        {searchResults && searchResults.length === 0 && (
          <View style={s.empty}>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center' }]}>No results found.</Text>
          </View>
        )}

        {searchResults && searchResults.length > 0 && (
          <>
            <Text style={[t.caption, { marginBottom: 8, paddingHorizontal: 4 }]}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </Text>
            {searchResults.map((r, i) => (
              <View key={r.verseKey} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                {i > 0 && <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />}
                <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                  {r.surahName} {r.verseKey}
                </Text>
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
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
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
  arabicText: {
    fontFamily: 'Inter_400Regular', fontSize: 22, lineHeight: 40,
    textAlign: 'right', writingDirection: 'rtl',
  },
  divider: { height: 1, marginVertical: 12 },
  empty: { paddingVertical: 40, alignItems: 'center' },
});
