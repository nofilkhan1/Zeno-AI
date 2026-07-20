import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Source } from '../lib/types';

type Props = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Source[] | null;
};

export default function MessageBubble({ role, content, sources }: Props) {
  const isUser = role === 'user';
  const hasSources = sources && sources.length > 0;

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {content}
        </Text>
        {hasSources && (
          <View style={styles.sourcesContainer}>
            <Text style={styles.sourcesLabel}>Sources</Text>
            {sources.map((s, i) => (
              <TouchableOpacity key={i} onPress={() => Linking.openURL(s.url)}>
                <Text style={styles.sourceLink} numberOfLines={1}>
                  {i + 1}. {s.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#2a2a3e',
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#e0e0e5',
  },
  sourcesContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#3a3a55',
  },
  sourcesLabel: {
    color: '#8888aa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sourceLink: {
    color: '#5b9aff',
    fontSize: 14,
    marginVertical: 2,
    textDecorationLine: 'underline',
  },
});
