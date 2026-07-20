import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Send } from 'lucide-react-native';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export default function InputBar({ onSend, disabled }: Props) {
  const [text, setText] = useState('');

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Message Zeno..."
        placeholderTextColor="#666"
        value={text}
        onChangeText={setText}
        multiline
        editable={!disabled}
      />
      <TouchableOpacity style={[styles.sendButton, disabled && styles.sendButtonDisabled]} onPress={handleSend} disabled={disabled}>
        {disabled ? <ActivityIndicator size="small" color="#fff" /> : <Send size={20} color="#fff" />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    backgroundColor: '#1a1a2e',
  },
  input: {
    flex: 1,
    backgroundColor: '#252540',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#e0e0e5',
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#1a3a5c',
  },
});
