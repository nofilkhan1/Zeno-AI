import { FlatList, View, StyleSheet, Text } from 'react-native';
import { Message } from '../lib/types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';

type Props = {
  messages?: Message[];
  onSend?: (text: string) => void;
};

export default function ChatScreen({ messages = [], onSend }: Props) {
  const streaming = messages.some((m) => m.role === 'assistant' && !m.content);

  return (
    <View style={styles.container}>
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
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Start a conversation</Text>
          </View>
        }
      />
      <InputBar onSend={(text) => onSend?.(text)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  list: {
    flexGrow: 1,
    paddingVertical: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
});
