import { FlatList, View, StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react-native';
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

export default function ChatScreen({ messages = [], onSend, sending, sendError, onDismissError }: Props) {
  const streaming = messages.some((m) => m.role === 'assistant' && !m.content);

  return (
    <View style={styles.container}>
      {sendError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>{sendError}</Text>
          <TouchableOpacity onPress={onDismissError}>
            <X size={18} color="#ff6b6b" />
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            role={item.role}
            content={item.content || (streaming ? '▊' : '')}
            sources={item.sources}
          />
        )}
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.empty}>
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
    padding: 10,
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a2a2a',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    flex: 1,
  },
  list: {
    paddingVertical: 12,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#f0f0f5',
    fontSize: 28,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
});
