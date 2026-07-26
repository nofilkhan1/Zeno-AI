import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, ChevronRight, CircleHelp, Info, Trash2 } from 'lucide-react-native';
import { getNotificationPreferences, registerForPushNotifications, setNotificationPreferences, storePushToken } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { radii, softShadow, typography, useColors, useThemeMode, type ThemeMode } from '../../lib/theme';

const TIME_OPTIONS = [
  { label: 'Fajr (dawn)', value: '05:00:00' },
  { label: 'Morning (6 AM)', value: '06:00:00' },
  { label: 'Mid-morning (8 AM)', value: '08:00:00' },
  { label: 'Noon (12 PM)', value: '12:00:00' },
  { label: 'Afternoon (3 PM)', value: '15:00:00' },
  { label: 'Evening (6 PM)', value: '18:00:00' },
  { label: 'Night (9 PM)', value: '21:00:00' },
];

type NotificationPreferences = {
  daily_verse_enabled: boolean;
  daily_dua_enabled: boolean;
  preferred_time: string;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  daily_verse_enabled: false,
  daily_dua_enabled: false,
  preferred_time: '06:00:00',
};

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const t = typography(colors);
  const { mode, setMode, resolved } = useThemeMode();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [pushSetupLoading, setPushSetupLoading] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const loadPreferences = useCallback(async () => {
    setPrefsLoading(true);
    const stored = await getNotificationPreferences();
    setPrefs(stored || DEFAULT_PREFERENCES);
    setPrefsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadPreferences();
  }, [loadPreferences]));

  async function enablePushIfNeeded(enabled: boolean, currentlyEnabled: boolean | undefined) {
    if (!enabled || currentlyEnabled) return;
    setPushSetupLoading(true);
    const token = await registerForPushNotifications();
    if (token) await storePushToken(token);
    setPushSetupLoading(false);
  }

  async function handleToggleVerse(value: boolean) {
    await enablePushIfNeeded(value, prefs?.daily_verse_enabled);
    await setNotificationPreferences({ daily_verse_enabled: value });
    setPrefs((current) => ({ ...(current || DEFAULT_PREFERENCES), daily_verse_enabled: value }));
  }

  async function handleToggleDua(value: boolean) {
    await enablePushIfNeeded(value, prefs?.daily_dua_enabled);
    await setNotificationPreferences({ daily_dua_enabled: value });
    setPrefs((current) => ({ ...(current || DEFAULT_PREFERENCES), daily_dua_enabled: value }));
  }

  async function handleTimeChange(time: string) {
    await setNotificationPreferences({ preferred_time: time });
    setPrefs((current) => ({ ...(current || DEFAULT_PREFERENCES), preferred_time: time }));
    setShowTimePicker(false);
  }

  function clearHistory() {
    Alert.alert('Clear History', 'Delete all chats and messages? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { data: chats } = await supabase.from('chats').select('id').eq('user_id', user.id);
          if (chats) {
            for (const chat of chats) {
              await supabase.from('messages').delete().eq('chat_id', chat.id);
              await supabase.from('chats').delete().eq('id', chat.id);
            }
          }
          Alert.alert('Done', 'All chat history cleared.');
        } catch {
          Alert.alert('Error', 'Failed to clear history.');
        }
      } },
    ]);
  }

  const selectedTime = TIME_OPTIONS.find((option) => option.value === prefs?.preferred_time)?.label || 'Morning (6 AM)';

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={s.content}>
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
        <Text style={[t.captionMedium, s.sectionTitle]}>APPEARANCE</Text>
        <Text style={[t.caption, s.sectionDescription]}>Choose how Zeno appears on this device.</Text>
        <View style={[s.themePicker, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              style={({ pressed }) => [s.themeOption, mode === option && { backgroundColor: colors.accent }, pressed && { opacity: 0.72 }]}
              onPress={() => setMode(option)}
            >
              <Text style={[t.captionMedium, { color: mode === option ? '#fff' : colors.textMuted }]}>
                {option === 'system' ? `System (${resolved === 'dark' ? 'Dark' : 'Light'})` : option[0].toUpperCase() + option.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
        <View style={s.sectionHeader}>
          <Bell size={18} color={colors.accent} />
          <Text style={[t.captionMedium, s.sectionHeaderText]}>NOTIFICATIONS</Text>
        </View>
        <Text style={[t.caption, s.sectionDescription]}>Choose which daily content Zeno sends and when.</Text>
        <Text style={[t.caption, s.pushNote, { color: colors.textMuted }]}>Remote push notifications require a development or production build and are unavailable in Expo Go on this SDK.</Text>

        {prefsLoading ? <ActivityIndicator size="small" color={colors.accent} /> : (
          <>
            <View style={[s.row, s.notificationRow]}>
              <View style={s.rowContent}>
                <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Daily Verse</Text>
                <Text style={t.caption}>Receive today&apos;s verse.</Text>
              </View>
              {pushSetupLoading ? <ActivityIndicator style={s.notificationControl} size="small" color={colors.accent} /> : <Switch style={s.notificationControl} value={prefs?.daily_verse_enabled ?? false} onValueChange={handleToggleVerse} trackColor={{ false: colors.composerBorder, true: colors.accent }} thumbColor="#fff" />}
            </View>
            <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
            <View style={[s.row, s.notificationRow]}>
              <View style={s.rowContent}>
                <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Daily Dua</Text>
                <Text style={t.caption}>Receive today&apos;s dua.</Text>
              </View>
              {pushSetupLoading ? <ActivityIndicator style={s.notificationControl} size="small" color={colors.accent} /> : <Switch style={s.notificationControl} value={prefs?.daily_dua_enabled ?? false} onValueChange={handleToggleDua} trackColor={{ false: colors.composerBorder, true: colors.accent }} thumbColor="#fff" />}
            </View>
            {(prefs?.daily_verse_enabled || prefs?.daily_dua_enabled) && (
              <>
                <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
                <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.72 }]} onPress={() => setShowTimePicker((visible) => !visible)}>
                  <View style={s.rowContent}>
                    <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Preferred time</Text>
                    <Text style={t.caption}>{selectedTime}</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} />
                </Pressable>
                {showTimePicker && TIME_OPTIONS.map((option) => (
                  <Pressable key={option.value} style={({ pressed }) => [s.timeOption, prefs?.preferred_time === option.value && { backgroundColor: colors.overlaySubtle }, pressed && { opacity: 0.72 }]} onPress={() => handleTimeChange(option.value)}>
                    <Text style={[t.body, { color: prefs?.preferred_time === option.value ? colors.accent : colors.textPrimary }]}>{option.label}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
      </View>

      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
        <Text style={[t.captionMedium, s.sectionTitle]}>HELP &amp; GUIDE</Text>
        <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.72 }]} onPress={() => router.push('/guide')}>
          <View style={s.helpRowContent}>
            <View style={[s.rowIcon, { backgroundColor: colors.overlaySubtle }]}><CircleHelp size={18} color={colors.accent} /></View>
            <View style={s.rowContent}>
              <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>How to use Zeno</Text>
              <Text style={t.caption}>Learn what each chat and learning mode does.</Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
        <Text style={[t.captionMedium, s.sectionTitle]}>ABOUT ZENO</Text>
        <Text style={[t.body, { color: colors.textPrimary, lineHeight: 23 }]}>Zeno brings general chat together with Quran learning tools.</Text>
        <View style={[s.trustNote, { backgroundColor: colors.overlaySubtle, borderColor: colors.composerBorder }]}>
          <Info size={17} color={colors.accent} />
          <Text style={[t.caption, s.trustText, { color: colors.textMuted }]}>Quran, Hadith, and Dua text displayed by Quran GPT is retrieved from configured sources and should not be treated as generated religious wording.</Text>
        </View>
      </View>

      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
        <Text style={[t.captionMedium, s.sectionTitle]}>DATA</Text>
        <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.72 }]} onPress={clearHistory}>
          <View style={s.helpRowContent}>
            <Trash2 size={19} color={colors.danger} />
            <View style={s.rowContent}>
              <Text style={[t.bodyMedium, { color: colors.danger }]}>Clear chat history</Text>
              <Text style={t.caption}>Delete all conversations from this account.</Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={[t.caption, s.version]}>Zeno v1.0.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { borderRadius: radii.md, padding: 16, borderWidth: 1 },
  sectionTitle: { marginBottom: 10, letterSpacing: 0.7 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionHeaderText: { letterSpacing: 0.7 },
  sectionDescription: { marginBottom: 12 },
  themePicker: { flexDirection: 'row', gap: 4, borderWidth: 1, borderRadius: radii.sm, padding: 3 },
  themeOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm - 2, paddingHorizontal: 4 },
  pushNote: { lineHeight: 18, marginBottom: 16 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  notificationRow: { minHeight: 64, paddingVertical: 8 },
  notificationControl: { flexShrink: 0 },
  rowContent: { flex: 1, minWidth: 0 },
  helpRowContent: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, marginVertical: 6 },
  timeOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radii.sm, marginTop: 6 },
  trustNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: radii.sm, padding: 12, marginTop: 12 },
  trustText: { flex: 1, lineHeight: 18 },
  version: { textAlign: 'center', marginTop: 8 },
});
