import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, Switch, LayoutAnimation, Platform, UIManager, useColorScheme } from 'react-native';
import { Menu, Settings, X, Trash2, Moon, Sun, Monitor } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Chat, Message } from '../../lib/types';
import { MODELS } from '../../lib/models';
import Sidebar from '../../components/Sidebar';
import ChatScreen from '../../components/ChatScreen';
import ModelPicker from '../../components/ModelPicker';
import ActionDialog from '../../components/ActionDialog';
import VoiceMode from '../../components/VoiceMode';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, useThemeMode, typography, radii, hitSlop } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chat`;
const LAST_MODEL_KEY = 'zeno-last-model';
const DEFAULT_MODEL_ID = 'nvidia/nemotron-3-nano-30b-a3b';

export default function ChatListScreen() {
  const colors = useColors();
  const t = typography(colors);
  const insets = useSafeAreaInsets();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [searchArmed, setSearchArmed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const searchArmedRef = useRef(false);

  useEffect(() => { loadChats(); }, []);
  useEffect(() => { if (activeChat) { loadMessages(activeChat.id); } }, [activeChat?.id]);

  async function loadChats() {
    setChatsLoading(true);
    const { data } = await supabase.from('chats').select('*').order('updated_at', { ascending: false });
    if (data) setChats(data);
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

  const handleToggleSearch = useCallback(() => {
    setSearchArmed((prev) => {
      const next = !prev;
      searchArmedRef.current = next;
      return next;
    });
  }, []);

  const abortChatIdRef = useRef<string | null>(null);

  const handleSend = useCallback(async (text: string) => {
    if (!activeChat || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    abortChatIdRef.current = activeChat.id;

    const chatId = activeChat.id;
    const armed = searchArmedRef.current;
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
      if (armed) {
        body.searchRequested = true;
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
      setSearchArmed(false);
      searchArmedRef.current = false;
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
      setSearchArmed(false);
      searchArmedRef.current = false;
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
    }
  }, [activeChat]);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.bg, paddingTop: insets.top + 10 }]}>
        <Pressable style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => setSidebarVisible(true)}>
          <Menu size={24} color={colors.textPrimary} />
        </Pressable>
        <ModelPicker selected={activeChat?.model || DEFAULT_MODEL_ID} onSelect={handleModelSelect} />
        <Pressable style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.7 }]} onPress={() => setShowSettings(true)}>
          <Settings size={24} color={colors.textMuted} />
        </Pressable>
      </View>
      <ChatScreen messages={messages} onSend={handleSend} sending={sending} sendError={sendError} onDismissError={() => setSendError(null)} chatModel={activeChat?.model} searchArmed={searchArmed} onToggleSearch={handleToggleSearch} onStartVoiceMode={() => setVoiceModeActive(true)} />
      <Sidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} onNewChat={handleNewChat} chats={chats} chatsLoading={chatsLoading} activeChatId={activeChat?.id} onSelectChat={(chat) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveChat(chat); setSendError(null); setSidebarVisible(false); }} onRenameChat={(chatId, newTitle) => { setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, title: newTitle } : c)); setActiveChat((prev) => prev?.id === chatId ? { ...prev, title: newTitle } : prev); }} />
      {voiceModeActive && activeChat && (
        <VoiceMode chatId={activeChat.id} onClose={() => { setVoiceModeActive(false); loadMessages(activeChat.id); }} />
      )}
      <SettingsOverlay visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
}

function SettingsOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { mode, setMode, resolved } = useThemeMode();
  const t = typography(colors);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const tx = useRef(new Animated.Value(300)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const isDark = mode === 'dark' || (mode === 'system' && resolved === 'dark');

  useEffect(() => {
    const duration = 200;
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(tx, { toValue: 300, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  function handleClose() {
    onClose();
  }

  function toggleTheme() {
    if (mode === 'system') setMode('dark');
    else if (mode === 'dark') setMode('light');
    else setMode('system');
  }

  function getLabel() {
    if (mode === 'system') return `System (${resolved === 'dark' ? 'Dark' : 'Light'})`;
    return mode === 'dark' ? 'Dark' : 'Light';
  }

  function getIcon() {
    if (mode === 'system') return <Monitor size={20} color={colors.accent} />;
    return isDark ? <Moon size={20} color={colors.accent} /> : <Sun size={20} color={colors.accent} />;
  }

  async function execClearHistory() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: chats } = await supabase.from('chats').select('id').eq('user_id', user.id);
      if (chats) {
        for (const c of chats) {
          await supabase.from('messages').delete().eq('chat_id', c.id);
          await supabase.from('chats').delete().eq('id', c.id);
        }
      }
    } catch {}
    setClearConfirm(false);
  }

  return (
    <>
      {mounted && (
        <Animated.View style={[sSettings.overlay, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)', opacity: fade }]}>
          <Pressable style={sSettings.overlayPress} onPress={handleClose} />
          <Animated.View style={[sSettings.panel, { backgroundColor: colors.sidebarBg, paddingTop: insets.top + 10, transform: [{ translateX: tx }] }]}>
            <View style={sSettings.header}>
              <Text style={t.title}>Settings</Text>
              <Pressable onPress={onClose} style={sSettings.closeBtn} hitSlop={hitSlop}>
                <X size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={sSettings.section}>
              <Text style={[t.captionMedium, sSettings.sectionTitle]}>APPEARANCE</Text>
              <Pressable
                style={({ pressed }) => [sSettings.row, pressed && { opacity: 0.7 }]}
                onPress={toggleTheme}
              >
                <View style={sSettings.rowLeft}>
                  {getIcon()}
                  <View>
                    <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Dark Mode</Text>
                    <Text style={[t.caption, { marginTop: 2 }]}>{getLabel()}</Text>
                  </View>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: colors.composerBorder, true: colors.accent }}
                  thumbColor={isDark ? '#fff' : '#f4f3f4'}
                />
              </Pressable>
            </View>

            <View style={sSettings.section}>
              <Text style={[t.captionMedium, sSettings.sectionTitle]}>DATA</Text>
              <Pressable
                style={({ pressed }) => [sSettings.row, pressed && { opacity: 0.7 }]}
                onPress={() => setClearConfirm(true)}
              >
                <View style={sSettings.rowLeft}>
                  <Trash2 size={20} color={colors.danger} />
                  <View>
                    <Text style={[t.bodyMedium, { color: colors.danger }]}>Clear chat history</Text>
                    <Text style={[t.caption, { marginTop: 2 }]}>Delete all conversations</Text>
                  </View>
                </View>
              </Pressable>
            </View>

            <Text style={[t.caption, sSettings.footer]}>Zeno v1.0.0</Text>
          </Animated.View>
        </Animated.View>
      )}
      <ActionDialog
        visible={clearConfirm}
        title="Clear History"
        message="Delete all chats and messages? This cannot be undone."
        actions={[
          { label: 'Cancel', onPress: () => setClearConfirm(false) },
          { label: 'Clear', destructive: true, onPress: execClearHistory },
        ]}
        onClose={() => setClearConfirm(false)}
      />
    </>
  );
}

const sSettings = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 110 },
  overlayPress: { ...StyleSheet.absoluteFill },
  panel: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 300 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  footer: { textAlign: 'center', marginTop: 24 },
});

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
