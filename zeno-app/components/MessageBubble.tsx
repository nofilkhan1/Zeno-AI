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
            {sources.map((s, i) => (
              <TouchableOpacity key={i} onPress={() => Linking.openURL(s.url)} style={styles.sourceItem}>
                <Text style={styles.sourceBullet}>{i + 1}</Text>
                <Text style={styles.sourceLink} numberOfLines={1}>{s.title}</Text>
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
    marginVertical: 3,
    paddingHorizontal: 14,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#2b4f8a',
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#1e1e2e',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#f0f0f5',
  },
  assistantText: {
    color: '#d0d0e0',
  },
  sourcesContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a44',
    gap: 6,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceBullet: {
    color: '#5b9aff',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#1a1a30',
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  sourceLink: {
    color: '#5b9aff',
    fontSize: 13,
    flex: 1,
    textDecorationLine: 'underline',
  },
});
