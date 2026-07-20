import { View, Text, Switch, Pressable, StyleSheet, Alert, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useColors, useThemeMode, typography, radii, softShadow } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SettingsScreen() {
  const router = useRouter();
  const { mode, setMode, resolved } = useThemeMode();
  const colors = useColors();
  const t = typography(colors);
  const isDark = mode === 'dark' || (mode === 'system' && resolved === 'dark');

  function toggleTheme() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (mode === 'system') setMode('dark');
    else if (mode === 'dark') setMode('light');
    else setMode('system');
  }

  function getLabel() {
    if (mode === 'system') return `System (${resolved === 'dark' ? 'Dark' : 'Light'})`;
    return mode === 'dark' ? 'Dark' : 'Light';
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
            for (const c of chats) {
              await supabase.from('messages').delete().eq('chat_id', c.id);
              await supabase.from('chats').delete().eq('id', c.id);
            }
          }
          Alert.alert('Done', 'All chat history cleared.');
        } catch { Alert.alert('Error', 'Failed to clear history.'); }
      }},
    ]);
  }

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.content}>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
          <Text style={[t.captionMedium, s.sectionTitle]}>APPEARANCE</Text>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Dark Mode</Text>
              <Text style={[t.caption, { marginTop: 2 }]}>{getLabel()}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.composerBorder, true: colors.accent }}
              thumbColor={isDark ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
          <Text style={[t.captionMedium, s.sectionTitle]}>DATA</Text>
          <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} onPress={clearHistory}>
            <View style={s.rowLeft}>
              <Text style={[t.bodyMedium, { color: colors.danger }]}>Clear chat history</Text>
              <Text style={[t.caption, { marginTop: 2 }]}>Delete all conversations</Text>
            </View>
            <Trash2 size={20} color={colors.danger} />
          </Pressable>
        </View>

        <Text style={[t.caption, s.footer]}>Zeno v1.0.0</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingTop: 24 },
  card: { borderRadius: radii.md, padding: 16, borderWidth: 1 },
  sectionTitle: { marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  rowLeft: { flex: 1 },
  footer: { textAlign: 'center', marginTop: 24 },
});
