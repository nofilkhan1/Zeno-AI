import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BookOpen, Bell, Star, ChevronRight } from 'lucide-react-native';
import { useColors, typography, radii, softShadow } from '../../lib/theme';
import QuranAyahText, { formatQuranTranslation, getAyahNumberFromVerseKey } from '../../components/QuranAyahText';

const TODAY_FN = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-daily-notification`;

type DailyVerse = {
  verseKey: string;
  arabic: string;
  translation: string;
  surahName: string;
};

type DailyDua = {
  title: string;
  arabic: string;
  translation: string;
  transliteration: string;
  source: string;
};

export default function TodayScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const router = useRouter();
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [dua, setDua] = useState<DailyDua | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadDailyContent();
    }, [])
  );

  async function loadDailyContent() {
    setLoading(true);
    try {
      const res = await fetch(TODAY_FN, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setVerse(data.verse);
        setDua(data.dua);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function getDateLabel(): string {
    const now = new Date();
    return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={[t.caption, { color: colors.textMuted, marginBottom: 16 }]}>{getDateLabel()}</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Daily Verse */}
          {verse && (
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
              <View style={s.cardHeader}>
                <BookOpen size={16} color={colors.accent} />
                <Text style={[t.captionMedium, { color: colors.accent, marginLeft: 8 }]}>
                  Daily Verse
                </Text>
              </View>
              <Text style={[s.surahLabel, { color: colors.textMuted }]}>
                {verse.surahName} {verse.verseKey}
              </Text>
              <QuranAyahText
                arabic={verse.arabic}
                ayah={getAyahNumberFromVerseKey(verse.verseKey)}
                style={[s.arabicText, { color: colors.textPrimary }]}
              />
              <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
              <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{formatQuranTranslation(verse.translation)}</Text>
            </View>
          )}

          {/* Daily Dua */}
          {dua && (
            <View style={[s.card, { backgroundColor: scheme === 'dark' ? '#2A2520' : '#FBF8F3', borderColor: colors.accent }, softShadow()]}>
              <View style={s.cardHeader}>
                <Star size={16} color={colors.accent} />
                <Text style={[t.captionMedium, { color: colors.accent, marginLeft: 8 }]}>
                  Daily Dua
                </Text>
              </View>
              {dua.title && (
                <Text style={[t.captionMedium, { color: colors.textPrimary, marginBottom: 8 }]}>{dua.title}</Text>
              )}
              <Text style={[s.arabicText, { color: colors.textPrimary }]}>{dua.arabic}</Text>
              {dua.transliteration && (
                <Text style={[t.caption, { color: colors.textMuted, fontStyle: 'italic', marginTop: 8 }]}>
                  {dua.transliteration}
                </Text>
              )}
              <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
              <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{dua.translation}</Text>
              {dua.source && (
                <Text style={[t.caption, { color: colors.textMuted, marginTop: 8 }]}>Source: {dua.source}</Text>
              )}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [s.manageNotifications, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow(), pressed && { opacity: 0.72 }]}
            onPress={() => router.push('/settings')}
          >
            <Bell size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Manage notifications</Text>
              <Text style={t.caption}>Daily verse and dua delivery preferences.</Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>

          {/* Info note */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.composerBorder, opacity: 0.8 }]}>
            <Text style={[t.caption, { color: colors.textMuted, lineHeight: 18, textAlign: 'center' }]}>
              The same verse and dua are shared with all users each day.
              {'\n'}Manage delivery preferences in Settings.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: {
    borderRadius: radii.md, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  surahLabel: { marginBottom: 8 },
  arabicText: {
    fontFamily: 'Inter_400Regular', fontSize: 22, lineHeight: 40,
    textAlign: 'right', writingDirection: 'rtl',
  },
  divider: { height: 1, marginVertical: 12 },
  manageNotifications: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: 16, marginBottom: 12 },
});
