import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Menu, Settings, Globe } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Chat, Message } from '../../lib/types';
import { MODELS } from '../../lib/models';
import Sidebar from '../../components/Sidebar';
import ChatScreen from '../../components/ChatScreen';
import ModelPicker from '../../components/ModelPicker';
import { useColors, typography, radii } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chat`;
const ACTIVE_CHAT_KEY = 'zeno-active-chat-id';
const LAST_MODEL_KEY = 'zeno-last-model';
const DEFAULT_MODEL_ID = 'nvidia/nemotron-3-nano-30b-a3b';

export default function ChatListScreen() {
  const router = useRouter();
  const colors = useColors();
  const t = typography(colors);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showWebPicker, setShowWebPicker] = useState(false);
  const [webModel, setWebModel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const webModelRef = useRef<string | null>(null);

  useEffect(() => { loadChats(); }, []);
  useEffect(() => { if (activeChat) { loadMessages(activeChat.id); persistActiveChat(activeChat.id); } }, [activeChat?.id]);

  async function persistActiveChat(id: string) {
    try { await AsyncStorage.setItem(ACTIVE_CHAT_KEY, id); } catch {}
  }

  async function loadChats() {
    setChatsLoading(true);
    let restoredId: string | null = null;
    try { restoredId = await AsyncStorage.getItem(ACTIVE_CHAT_KEY); } catch {}
    const { data } = await supabase.from('chats').select('*').order('updated_at', { ascending: false });
    if (data) {
      setChats(data);
      if (data.length > 0 && !activeChat) {
        const restored = restoredId ? data.find((c) => c.id === restoredId) : undefined;
        setActiveChat(restored || data[0]);
      }
    }
    setChatsLoading(false);
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (data) setMessages(data);
  }

  const handleNewChat = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let lastModel = DEFAULT_MODEL_ID;
    try { const saved = await AsyncStorage.getItem(LAST_MODEL_KEY); if (saved) lastModel = saved; } catch {}
    const { data, error } = await supabase.from('chats').insert({ user_id: user.id, model: lastModel }).select().single();
    if (error) return;
    setActiveChat(data); setMessages([]); setChats((prev) => [data, ...prev]); setSendError(null); setSidebarVisible(false);
  }, []);

  const handleModelSelect = useCallback(async (modelId: string) => {
    if (!activeChat) return;
    setActiveChat((prev) => prev ? { ...prev, model: modelId } : null);
    await supabase.from('chats').update({ model: modelId }).eq('id', activeChat.id);
    try { await AsyncStorage.setItem(LAST_MODEL_KEY, modelId); } catch {}
  }, [activeChat]);

  function handleWebModelSelect(modelId: string) {
    if (modelId === '__cancel__') { setShowWebPicker(false); return; }
    setWebModel(modelId);
    webModelRef.current = modelId;
    setShowWebPicker(false);
  }

  const abortChatIdRef = useRef<string | null>(null);

  const handleSend = useCallback(async (text: string) => {
    if (!activeChat || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    abortChatIdRef.current = activeChat.id;

    const chatId = activeChat.id;
    const useWeb = webModelRef.current;
    const userMsg: Message = { id: randomId(), chat_id: chatId, role: 'user', content: text, created_at: new Date().toISOString() };
    const assistantId = randomId();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, chat_id: chatId, role: 'assistant', content: '', created_at: new Date().toISOString() } as Message]);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const body: Record<string, unknown> = { chatId, message: text };
      if (useWeb) {
        body.forceSearch = true;
        body.modelOverride = useWeb;
      }
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
        const updated = { content: data.content || '', used_web_search: !!data.usedSearch, sources: data.sources || [], answered_by_model: data.answeredByModel || undefined };
        if (existing) {
          return prev.map((m) => m.id === assistantId ? { ...m, ...updated } : m);
        }
        return [...prev, { id: assistantId, chat_id: chatId, role: 'assistant' as const, ...updated, created_at: new Date().toISOString() } as Message];
      });
      if (useWeb) { setWebModel(null); webModelRef.current = null; }
      loadChats();
    } catch (err) {
      if (abortChatIdRef.current !== chatId) return;
      clearTimeout(timeoutId);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message?.includes('cancelled') || err.message?.includes('aborted'));
      const isRateLimit = errMsg.toLowerCase().includes('rate limit');
      const displayMsg = isAbort ? 'Request timed out. The server is busy — try again in a moment.' : isRateLimit ? 'Too many requests. Please wait a moment before sending another message.' : errMsg;
      setSendError(displayMsg);
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === assistantId && !m.content);
        const errMsgStr = `Error: ${displayMsg}`;
        if (existing) {
          return prev.map((m) => m.id === assistantId && !m.content ? { ...m, content: errMsgStr, used_web_search: false } : m);
        }
        return [...prev, { id: assistantId, chat_id: chatId, role: 'assistant' as const, content: errMsgStr, used_web_search: false, created_at: new Date().toISOString() } as Message];
      });
      if (useWeb) { setWebModel(null); webModelRef.current = null; }
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
    }
  }, [activeChat]);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.bg }]}>
        <Pressable style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => setSidebarVisible(true)}>
          <Menu size={24} color={colors.textPrimary} />
        </Pressable>
        <ModelPicker selected={activeChat?.model || DEFAULT_MODEL_ID} onSelect={handleModelSelect} />
        <Pressable style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => router.push('./settings')}>
          <Settings size={24} color={colors.textMuted} />
        </Pressable>
      </View>
      {webModel && (
        <View style={[s.webBanner, { backgroundColor: colors.surface, borderColor: colors.composerBorder }]}>
          <Globe size={14} color={colors.accent} />
          <Text style={[t.caption, { color: colors.accent }]}>Web search: {MODELS.find((m) => m.id === webModel)?.label || webModel}</Text>
          <Pressable onPress={() => { setWebModel(null); webModelRef.current = null; }}>
            <Text style={[t.caption, { color: colors.textMuted, marginLeft: 8 }]}>Cancel</Text>
          </Pressable>
        </View>
      )}
      <ChatScreen messages={messages} onSend={handleSend} sending={sending} sendError={sendError} onDismissError={() => setSendError(null)} chatModel={activeChat?.model} onWebGlobePress={() => setShowWebPicker(true)} />
      <Sidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} onNewChat={handleNewChat} chats={chats} chatsLoading={chatsLoading} activeChatId={activeChat?.id} onSelectChat={(chat) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveChat(chat); setSendError(null); setSidebarVisible(false); }} onRenameChat={(chatId, newTitle) => { setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, title: newTitle } : c)); setActiveChat((prev) => prev?.id === chatId ? { ...prev, title: newTitle } : prev); }} />
      {showWebPicker && (
        <ModelPicker selected={MODELS.find((m) => m.supportsTools)?.id} onSelect={handleWebModelSelect} webMode label="Select a web search model" />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, paddingTop: 52 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  webBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.sm, borderWidth: 1 },
});
