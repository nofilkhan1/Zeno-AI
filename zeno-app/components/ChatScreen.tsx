import { FlatList, View, StyleSheet, Text } from 'react-native';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const DUMMY_MESSAGES: Message[] = [
  { id: '1', role: 'assistant', content: 'Hello! How can I help you today?' },
  { id: '2', role: 'user', content: 'What is the capital of France?' },
  { id: '3', role: 'assistant', content: 'The capital of France is Paris.' },
  { id: '4', role: 'user', content: 'Can you explain quantum computing in simple terms?' },
  {
    id: '5',
    role: 'assistant',
    content: 'Quantum computing uses quantum bits (qubits) that can exist in multiple states at once, unlike classical bits that are either 0 or 1. This allows quantum computers to solve certain problems much faster than traditional computers.',
  },
];

type Props = {
  messages?: Message[];
  onSend?: (text: string) => void;
};

export default function ChatScreen({ messages = DUMMY_MESSAGES, onSend }: Props) {
  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble role={item.role} content={item.content} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No messages yet</Text>
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
