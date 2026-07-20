import { View, Text, StyleSheet, Linking, Pressable, useColorScheme } from 'react-native';
import { Source } from '../lib/types';
import { useColors, typography, radii } from '../lib/theme';

type Props = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Source[] | null;
  answeredByModel?: string | null;
  chatModel?: string;
};

export default function MessageBubble({ role, content, sources, answeredByModel, chatModel }: Props) {
  const colors = useColors();
  const t = typography(colors);
  const isUser = role === 'user';
  const hasSources = sources && sources.length > 0;
  const showAnsweredBy = !!answeredByModel && answeredByModel !== chatModel;
  const lastSegment = answeredByModel?.split('/').pop() || '';

  if (isUser) {
    return (
      <View style={sr.userContainer}>
        <View style={[sr.userBubble, { backgroundColor: colors.userBubble }]}>
          <Text style={[t.body, { color: colors.textPrimary }]}>{content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={sr.assistantContainer}>
      <Text style={[t.body, { lineHeight: 26, color: colors.textPrimary }]}>{content}</Text>
      {hasSources && (
        <View style={[sr.sourcesContainer, { borderTopColor: colors.composerBorder }]}>
          {sources.map((src, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(src.url)} style={sr.sourceItem}>
              <Text style={[sr.sourceBullet, { backgroundColor: colors.userBubble, color: colors.accent }]}>{i + 1}</Text>
              <Text style={[sr.sourceLink, { color: colors.accent }]} numberOfLines={1}>{src.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {showAnsweredBy && (
        <Text style={[sr.answeredBy, { color: colors.textMuted }]}>Answered using {lastSegment}{hasSources ? ' (web search)' : ''}</Text>
      )}
    </View>
  );
}

const sr = StyleSheet.create({
  userContainer: { alignItems: 'flex-end', paddingHorizontal: 14, marginVertical: 4 },
  userBubble: { maxWidth: '80%', borderRadius: radii.md, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 10 },
  assistantContainer: { paddingHorizontal: 14, marginVertical: 6 },
  sourcesContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, gap: 6 },
  sourceItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceBullet: { fontSize: 11, fontWeight: '700', width: 20, height: 20, borderRadius: 10, textAlign: 'center', lineHeight: 20, overflow: 'hidden' },
  sourceLink: { fontSize: 13, flex: 1, textDecorationLine: 'underline', fontFamily: 'Inter_500Medium' },
  answeredBy: { fontSize: 13, marginTop: 4, fontStyle: 'italic', fontFamily: 'Inter_400Regular' },
});
