import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Menu, Settings } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Chat, Message } from '../../lib/types';
import { MODELS } from '../../lib/models';
import Sidebar from '../../components/Sidebar';
import ChatScreen from '../../components/ChatScreen';
import ModelPicker from '../../components/ModelPicker';
import { useColors } from '../../lib/theme';

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chat`;

export default function ChatListScreen() {
  const router = useRouter();
  const colors = useColors();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [forceSearch, setForceSearch] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => { loadChats(); }, []);
  useEffect(() => { if (activeChat) loadMessages(activeChat.id); }, [activeChat?.id]);

  async function loadChats() {
    setChatsLoading(true);
    const { data } = await supabase.from('chats').select('*').order('updated_at', { ascending: false });
    if (data) { setChats(data); if (data.length > 0 && !activeChat) setActiveChat(data[0]); }
    setChatsLoading(false);
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (data) setMessages(data);
  }

  const handleNewChat = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('chats').insert({ user_id: user.id, model: MODELS[0].id }).select().single();
    if (error) return;
    setActiveChat(data); setMessages([]); setChats((prev) => [data, ...prev]); setSendError(null); setSidebarVisible(false);
  }, []);

  const handleModelSelect = useCallback(async (modelId: string) => {
    if (!activeChat) return;
    setActiveChat((prev) => prev ? { ...prev, model: modelId } : null);
    await supabase.from('chats').update({ model: modelId }).eq('id', activeChat.id);
  }, [activeChat]);

  const abortChatIdRef = useRef<string | null>(null);

  const handleSend = useCallback(async (text: string) => {
    if (!activeChat || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    abortChatIdRef.current = activeChat.id;

    const chatId = activeChat.id;
    const userMsg: Message = { id: randomId(), chat_id: chatId, role: 'user', content: text, created_at: new Date().toISOString() };
    const assistantId = randomId();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, chat_id: chatId, role: 'assistant', content: '', created_at: new Date().toISOString() } as Message]);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: text, forceSearch }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const isRateLimited = response.status === 429;
      const data = await response.json();

      if (isRateLimited || !response.ok || data.error) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === assistantId);
        if (existing) {
          return prev.map((m) => m.id === assistantId ? { ...m, content: data.content || '', sources: data.sources || [], answered_by_model: data.answeredByModel || undefined } : m);
        }
        // Restore if wiped by stale loadMessages
        return [...prev, { id: assistantId, chat_id: chatId, role: 'assistant' as const, content: data.content || '', sources: data.sources || [], answered_by_model: data.answeredByModel || undefined, created_at: new Date().toISOString() } as Message];
      });
      loadChats();
    } catch (err) {
      if (abortChatIdRef.current !== chatId) return; // stale response, ignore
      clearTimeout(timeoutId);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message?.includes('cancelled') || err.message?.includes('aborted'));
      const isRateLimit = errMsg.toLowerCase().includes('rate limit');
      const displayMsg = isAbort ? 'Request timed out. The server is busy — try again in a moment.' : isRateLimit ? 'Too many requests. Please wait a moment before sending another message.' : errMsg;
      setSendError(displayMsg);
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === assistantId && !m.content);
        if (existing) {
          return prev.map((m) => m.id === assistantId && !m.content ? { ...m, content: `Error: ${displayMsg}` } : m);
        }
        return [...prev, { id: assistantId, chat_id: chatId, role: 'assistant' as const, content: `Error: ${displayMsg}`, created_at: new Date().toISOString() } as Message];
      });
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
    }
  }, [activeChat, forceSearch]);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.bg }]}>
        <Pressable style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => setSidebarVisible(true)}>
          <Menu size={24} color={colors.textPrimary} />
        </Pressable>
        <ModelPicker selected={activeChat?.model || MODELS[0].id} onSelect={handleModelSelect} />
        <Pressable style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => router.push('./settings')}>
          <Settings size={24} color={colors.textMuted} />
        </Pressable>
      </View>
      <ChatScreen messages={messages} onSend={handleSend} sending={sending} sendError={sendError} onDismissError={() => setSendError(null)} chatModel={activeChat?.model} forceSearch={forceSearch} onForceSearchChange={setForceSearch} />
      <Sidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} onNewChat={handleNewChat} chats={chats} chatsLoading={chatsLoading} activeChatId={activeChat?.id} onSelectChat={(chat) => { setActiveChat(chat); setSendError(null); setSidebarVisible(false); }} onRenameChat={(chatId, newTitle) => { setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, title: newTitle } : c)); setActiveChat((prev) => prev?.id === chatId ? { ...prev, title: newTitle } : prev); }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, paddingTop: 52 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
