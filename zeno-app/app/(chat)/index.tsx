import { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Menu } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Chat, Message } from '../../lib/types';
import { MODELS } from '../../lib/models';
import Sidebar from '../../components/Sidebar';
import ChatScreen from '../../components/ChatScreen';
import ModelPicker from '../../components/ModelPicker';

export default function ChatListScreen() {
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id);
    }
  }, [activeChat?.id]);

  async function loadChats() {
    const { data } = await supabase
      .from('chats')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) {
      setChats(data);
      if (data.length > 0 && !activeChat) {
        setActiveChat(data[0]);
      }
    }
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  }

  const handleNewChat = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('chats')
      .insert({ user_id: user.id, model: 'meta/llama-3.3-70b-instruct' })
      .select()
      .single();

    if (error) {
      Alert.alert('Error', 'Could not create chat');
      return;
    }

    setActiveChat(data);
    setMessages([]);
    setChats((prev) => [data, ...prev]);
    setSidebarVisible(false);
  }, []);

  const handleModelSelect = useCallback(async (modelId: string) => {
    if (!activeChat) return;
    setActiveChat((prev) => prev ? { ...prev, model: modelId } : null);
    await supabase.from('chats').update({ model: modelId }).eq('id', activeChat.id);
  }, [activeChat]);

  const handleSend = useCallback(async (text: string) => {
    if (!activeChat || sending) return;

    setSending(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      chat_id: activeChat.id,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { chatId: activeChat.id, message: text },
      });

      if (error) {
        Alert.alert('Error', error.message || 'Failed to get response');
        return;
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        chat_id: activeChat.id,
        role: 'assistant',
        content: data.reply,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      Alert.alert('Error', 'Could not connect to AI. Please try again.');
    } finally {
      setSending(false);
    }
  }, [activeChat, sending]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSidebarVisible(true)} style={styles.menuButton}>
          <Menu size={24} color="#e0e0e5" />
        </TouchableOpacity>
        <ModelPicker
          selected={activeChat?.model || MODELS[0].id}
          onSelect={handleModelSelect}
        />
      </View>
      <ChatScreen messages={messages} onSend={handleSend} />
      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        onNewChat={handleNewChat}
        chats={chats}
        onSelectChat={(chat) => {
          setActiveChat(chat);
          setSidebarVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingTop: 50,
    backgroundColor: '#1a1a2e',
  },
  menuButton: {
    padding: 4,
  },
});
