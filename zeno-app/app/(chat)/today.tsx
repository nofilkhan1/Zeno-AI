import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, useColorScheme, Switch, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BookOpen, Bell, BellOff, Sun, Moon, Star, ChevronRight, Sparkles } from 'lucide-react-native';
import { useColors, typography, radii, softShadow } from '../../lib/theme';
import { registerForPushNotifications, storePushToken, getNotificationPreferences, setNotificationPreferences, removePushToken } from '../../lib/notifications';
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

const TIME_OPTIONS = [
  { label: 'Fajr (dawn)', value: '05:00:00' },
  { label: 'Morning (6 AM)', value: '06:00:00' },
  { label: 'Mid-morning (8 AM)', value: '08:00:00' },
  { label: 'Noon (12 PM)', value: '12:00:00' },
  { label: 'Afternoon (3 PM)', value: '15:00:00' },
  { label: 'Evening (6 PM)', value: '18:00:00' },
  { label: 'Night (9 PM)', value: '21:00:00' },
];

export default function TodayScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [dua, setDua] = useState<DailyDua | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<{ daily_verse_enabled: boolean; daily_dua_enabled: boolean; preferred_time: string } | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [pushSetupLoading, setPushSetupLoading] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadDailyContent();
      loadPreferences();
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

  async function loadPreferences() {
    setPrefsLoading(true);
    const p = await getNotificationPreferences();
    setPrefs(p || { daily_verse_enabled: false, daily_dua_enabled: false, preferred_time: '06:00:00' });
    setPrefsLoading(false);
  }

  async function handleToggleVerse(value: boolean) {
    if (value && !prefs?.daily_verse_enabled) {
      setPushSetupLoading(true);
      const token = await registerForPushNotifications();
      if (token) {
        await storePushToken(token);
      }
      setPushSetupLoading(false);
    }
    await setNotificationPreferences({ daily_verse_enabled: value });
    setPrefs((prev) => prev ? { ...prev, daily_verse_enabled: value } : { daily_verse_enabled: value, daily_dua_enabled: false, preferred_time: '06:00:00' });
  }

  async function handleToggleDua(value: boolean) {
    if (value && !prefs?.daily_dua_enabled) {
      setPushSetupLoading(true);
      const token = await registerForPushNotifications();
      if (token) {
        await storePushToken(token);
      }
      setPushSetupLoading(false);
    }
    await setNotificationPreferences({ daily_dua_enabled: value });
    setPrefs((prev) => prev ? { ...prev, daily_dua_enabled: value } : { daily_verse_enabled: false, daily_dua_enabled: value, preferred_time: '06:00:00' });
  }

  async function handleTimeChange(time: string) {
    await setNotificationPreferences({ preferred_time: time });
    setPrefs((prev) => prev ? { ...prev, preferred_time: time } : { daily_verse_enabled: false, daily_dua_enabled: false, preferred_time: time });
    setShowTimePicker(false);
  }

  function getDateLabel(): string {
    const now = new Date();
    return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function getTimeLabel(value: string): string {
    const opt = TIME_OPTIONS.find((o) => o.value === value);
    return opt ? opt.label : value;
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={s.header}>
        <Sparkles size={20} color={colors.accent} />
        <Text style={[t.heading, { color: colors.accent, marginLeft: 8 }]}>Today</Text>
      </View>
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

          {/* Notification Preferences */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
            <View style={s.cardHeader}>
              <Bell size={16} color={colors.accent} />
              <Text style={[t.captionMedium, { color: colors.accent, marginLeft: 8 }]}>
                Daily Notifications
              </Text>
            </View>
            <Text style={[t.caption, { color: colors.textMuted, marginBottom: 12 }]}>
              Receive a push notification each day with the verse and dua above.
            </Text>

            {prefsLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <View style={s.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.body, { color: colors.textPrimary }]}>Daily Verse</Text>
                    <Text style={[t.caption, { color: colors.textMuted }]}>Receive today's verse</Text>
                  </View>
                  {pushSetupLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Switch
                      value={prefs?.daily_verse_enabled ?? false}
                      onValueChange={handleToggleVerse}
                      trackColor={{ false: colors.composerBorder, true: colors.accent }}
                      thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                    />
                  )}
                </View>

                <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />

                <View style={s.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.body, { color: colors.textPrimary }]}>Daily Dua</Text>
                    <Text style={[t.caption, { color: colors.textMuted }]}>Receive today's dua</Text>
                  </View>
                  {pushSetupLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Switch
                      value={prefs?.daily_dua_enabled ?? false}
                      onValueChange={handleToggleDua}
                      trackColor={{ false: colors.composerBorder, true: colors.accent }}
                      thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                    />
                  )}
                </View>

                {(prefs?.daily_verse_enabled || prefs?.daily_dua_enabled) && (
                  <>
                    <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
                    <Pressable
                      style={s.timeRow}
                      onPress={() => setShowTimePicker(!showTimePicker)}
                    >
                      <Sun size={16} color={colors.accent} />
                      <Text style={[t.body, { color: colors.textPrimary, flex: 1, marginLeft: 8 }]}>
                        Preferred time
                      </Text>
                      <Text style={[t.caption, { color: colors.textMuted, marginRight: 4 }]}>
                        {prefs ? getTimeLabel(prefs.preferred_time) : 'Morning (6 AM)'}
                      </Text>
                      <ChevronRight size={14} color={colors.textMuted} />
                    </Pressable>

                    {showTimePicker && (
                      <View style={{ marginTop: 8 }}>
                        {TIME_OPTIONS.map((opt) => (
                          <Pressable
                            key={opt.value}
                            style={[
                              s.timeOption,
                              {
                                backgroundColor: prefs?.preferred_time === opt.value
                                  ? (scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)')
                                  : 'transparent',
                              },
                            ]}
                            onPress={() => handleTimeChange(opt.value)}
                          >
                            <Text style={[
                              t.body,
                              {
                                color: prefs?.preferred_time === opt.value ? colors.accent : colors.textPrimary,
                              },
                            ]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </View>

          {/* Info note */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.composerBorder, opacity: 0.8 }]}>
            <Text style={[t.caption, { color: colors.textMuted, lineHeight: 18, textAlign: 'center' }]}>
              The same verse and dua are shared with all users each day.
              {'\n'}Turn on notifications above to receive them as a push.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
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
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  timeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
  },
  timeOption: {
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.sm,
    marginBottom: 4,
  },
});
