import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { Source } from '../lib/types';
import { useColors, typography, radii } from '../lib/theme';

type Props = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Source[] | null;
  answeredByModel?: string | null;
  chatModel?: string;
  webSearch?: boolean | null;
};

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function MessageBubble({ role, content, sources, answeredByModel, chatModel, webSearch }: Props) {
  const colors = useColors();
  const t = typography(colors);
  const isUser = role === 'user';
  const hasSources = sources && sources.length > 0;
  const showAnsweredBy = !!answeredByModel && answeredByModel !== chatModel;
  const lastSegment = answeredByModel?.split('/').pop() || '';
  const showSearchLabel = webSearch || showAnsweredBy;

  if (isUser) {
    return (
      <View style={sr.userContainer}>
        <View style={[sr.userBubble, { backgroundColor: colors.userBubble }]}>
          <Text style={t.body}>{content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={sr.assistantContainer}>
      <Text style={t.body}>{content}</Text>
      {hasSources && (
        <View style={[sr.sourcesContainer, { borderTopColor: colors.composerBorder }]}>
          {sources.map((src, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                sr.sourceCard,
                { backgroundColor: colors.userBubble },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => Linking.openURL(src.url)}
            >
              <Text style={[sr.sourceDomain, { color: colors.textMuted }]} numberOfLines={1}>
                {extractDomain(src.url)}
              </Text>
              <Text style={[sr.sourceTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {src.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {!hasSources && showSearchLabel && (
        <View style={[sr.webSearchBadge, { backgroundColor: colors.userBubble, borderColor: colors.composerBorder }]}>
          <Text style={[sr.badgeText, { color: colors.accent }]}>Web search</Text>
        </View>
      )}
      {showAnsweredBy && (
        <Text style={[sr.answeredBy, { color: colors.textMuted }]}>Answered using {lastSegment}{hasSources ? ' (web search)' : ''}</Text>
      )}
      {!showAnsweredBy && webSearch && (
        <Text style={[sr.answeredBy, { color: colors.textMuted }]}>Web search</Text>
      )}
    </View>
  );
}

const sr = StyleSheet.create({
  userContainer: { alignItems: 'flex-end', paddingHorizontal: 16, marginVertical: 8 },
  userBubble: { maxWidth: '80%', borderRadius: radii.md, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12 },
  assistantContainer: { paddingHorizontal: 16, marginVertical: 8 },
  sourcesContainer: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  sourceCard: { borderRadius: radii.sm, padding: 12 },
  sourceDomain: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  sourceTitle: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 20 },
  answeredBy: { fontSize: 13, marginTop: 8, fontStyle: 'italic', fontFamily: 'Inter_400Regular' },
  webSearchBadge: { alignSelf: 'flex-start', marginTop: 8, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
