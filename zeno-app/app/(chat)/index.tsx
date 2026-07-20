import { useState, useEffect, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Menu } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Chat, Message } from '../../lib/types';
import { MODELS } from '../../lib/models';
import Sidebar from '../../components/Sidebar';
import ChatScreen from '../../components/ChatScreen';
import ModelPicker from '../../components/ModelPicker';

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chat`;

export default function ChatListScreen() {
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id);
    }
  }, [activeChat?.id]);

  async function loadChats() {
    setChatsLoading(true);
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
    setChatsLoading(false);
  }

  async function loadMessages(chatId: string) {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
    setMessagesLoading(false);
  }

  const handleNewChat = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('chats')
      .insert({ user_id: user.id, model: MODELS[0].id })
      .select()
      .single();

    if (error) {
      Alert.alert('Error', 'Could not create chat');
      return;
    }

    setActiveChat(data);
    setMessages([]);
    setChats((prev) => [data, ...prev]);
    setSendError(null);
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
    setSendError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      chat_id: activeChat.id,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      chat_id: activeChat.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      abortRef.current = new AbortController();

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chatId: activeChat.id, message: text }),
        signal: abortRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: data.content || '', sources: data.sources || [] }
            : m
        )
      );

      loadMessages(activeChat.id);
      loadChats();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;

      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setSendError(errorMsg);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && !m.content
            ? { ...m, content: `Error: ${errorMsg}` }
            : m
        )
      );
    } finally {
      abortRef.current = null;
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
      <ChatScreen
        messages={messages}
        onSend={handleSend}
        sending={sending}
        sendError={sendError}
        onDismissError={() => setSendError(null)}
      />
      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        onNewChat={handleNewChat}
        chats={chats}
        chatsLoading={chatsLoading}
        onSelectChat={(chat) => {
          setActiveChat(chat);
          setSendError(null);
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
