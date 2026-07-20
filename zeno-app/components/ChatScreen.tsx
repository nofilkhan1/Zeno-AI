import { FlatList, View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { X, Sparkles, Brain } from 'lucide-react-native';
import { Message } from '../lib/types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';

type Props = {
  messages?: Message[];
  onSend?: (text: string) => void;
  sending?: boolean;
  sendError?: string | null;
  onDismissError?: () => void;
};

function ThinkingIndicator() {
  return (
    <View style={styles.thinkingContainer}>
      <Brain size={16} color="#5b9aff" />
      <Text style={styles.thinkingText}>Thinking…</Text>
    </View>
  );
}

export default function ChatScreen({ messages = [], onSend, sending, sendError, onDismissError }: Props) {
  const hasPendingAssistant = messages.some((m) => m.role === 'assistant' && !m.content);

  return (
    <View style={styles.container}>
      {sendError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>{sendError}</Text>
          <TouchableOpacity onPress={onDismissError} style={styles.errorDismiss}>
            <X size={16} color="#ff6b6b" />
          </TouchableOpacity>
        </View>
      ) : null}
      {hasPendingAssistant && (
        <View style={styles.thinkingBar}>
          <ThinkingIndicator />
        </View>
      )}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isThinking = item.role === 'assistant' && !item.content;
          if (isThinking) return null;
          return (
            <MessageBubble
              role={item.role}
              content={item.content || ''}
              sources={item.sources}
            />
          );
        }}
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Sparkles size={32} color="#5b9aff" />
            </View>
            <Text style={styles.emptyTitle}>Zeno</Text>
            <Text style={styles.emptyText}>Start a conversation</Text>
          </View>
        }
      />
      <InputBar onSend={(text) => onSend?.(text)} disabled={sending} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: '#1e1414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a1e1e',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  errorDismiss: {
    padding: 4,
  },
  thinkingBar: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  thinkingText: {
    color: '#5b9aff',
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a1a30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: '#f0f0f5',
    fontSize: 26,
    fontWeight: '700',
  },
  emptyText: {
    color: '#555',
    fontSize: 15,
  },
});
