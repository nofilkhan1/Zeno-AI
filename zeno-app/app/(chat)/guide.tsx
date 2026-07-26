import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors, typography, radii, softShadow } from '../../lib/theme';

const GUIDE_SECTIONS = [
  { title: 'Chat', purpose: 'General AI conversation.', use: 'Start or select a chat, then send a message.', result: 'A conversational response from Zeno.', note: 'Zeno is not a substitute for professional advice.' },
  { title: 'Ask Quran', purpose: 'Retrieval-grounded Quran questions.', use: 'Open Quran GPT, choose Ask Quran, and enter a question.', result: 'Sourced content and a confidence indicator when available.', note: 'It is not a fatwa; religious wording must remain source-backed.' },
  { title: 'Search Quran & Hadith', purpose: 'Verse lookup, Quran translation search, and Hadith-topic search.', use: 'Enter 2:255, Quran keywords, or switch to Hadith.', result: 'Retrieved Quran or Hadith results.', note: 'Coverage and translations depend on configured sources.' },
  { title: 'Hifz', purpose: 'Memorization practice.', use: 'Select a surah and choose a practice mode.', result: 'Verse practice and saved progress.', note: 'Verify recitation with a qualified teacher.' },
  { title: 'Quran Quiz', purpose: 'Learning review.', use: 'Choose a scope and question count, then start.', result: 'Quiz feedback and a score.', note: 'This is educational review, not a mastery assessment.' },
  { title: 'Today’s Verse & Dua', purpose: 'Daily retrieved content.', use: 'Read Today and manage delivery in Settings.', result: 'A daily verse and dua, with optional notifications.', note: 'Daily content is shared; pushes require a supported build.' },
  { title: 'Voice mode', purpose: 'Spoken chat.', use: 'In Chat, open the plus menu and choose Voice to Voice.', result: 'Speech input and spoken output.', note: 'Speech recognition can mishear important wording.' },
];

export default function GuideScreen() {
  const colors = useColors();
  const t = typography(colors);

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={s.content}>
      <Text style={[t.body, s.intro, { color: colors.textMuted }]}>A quick guide to Zeno’s chat and learning tools.</Text>
      {GUIDE_SECTIONS.map((section) => (
        <View key={section.title} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
          <Text style={[t.heading, { color: colors.textPrimary }]}>{section.title}</Text>
          <GuideRow label="Purpose" value={section.purpose} />
          <GuideRow label="How to use" value={section.use} />
          <GuideRow label="What to expect" value={section.result} />
          <GuideRow label="Important note" value={section.note} emphasized />
        </View>
      ))}
    </ScrollView>
  );
}

function GuideRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  const colors = useColors();
  const t = typography(colors);
  return (
    <View style={s.row}>
      <Text style={[t.captionMedium, s.label, { color: emphasized ? colors.accent : colors.textMuted }]}>{label}</Text>
      <Text style={[t.caption, s.value, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  intro: { marginBottom: 2 },
  card: { borderWidth: 1, borderRadius: radii.md, padding: 16 },
  row: { marginTop: 10 },
  label: { marginBottom: 2 },
  value: { lineHeight: 19 },
});
