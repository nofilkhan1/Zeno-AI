import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, FlatList, Animated, Easing, StyleSheet, ActivityIndicator, TextInput, Pressable, Switch, useColorScheme } from 'react-native';
import ActionDialog from './ActionDialog';
import { Plus, MessageSquare, X, LogOut, Check, MoreHorizontal, ArrowLeft, Trash2, Moon, Sun, Monitor } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Chat } from '../lib/types';
import { useColors, useThemeMode, typography, radii, softShadow, hitSlop } from '../lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chats?: Chat[];
  onSelectChat?: (chat: Chat) => void;
  chatsLoading?: boolean;
  activeChatId?: string | null;
  onRenameChat?: (chatId: string, newTitle: string) => void;
  showSettings?: boolean;
  onToggleSettings?: () => void;
};

const SIDEBAR_WIDTH = 300;

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SettingsPanel({ onBack }: { onBack: () => void }) {
  const colors = useColors();
  const { mode, setMode, resolved } = useThemeMode();
  const t = typography(colors);
  const [clearConfirm, setClearConfirm] = useState(false);
  const scheme = useColorScheme();
  const isDark = mode === 'dark' || (mode === 'system' && resolved === 'dark');

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
    <View style={s.settingsPanel}>
      <View style={s.header}>
        <Pressable onPress={onBack} style={s.closeBtn} hitSlop={hitSlop}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={t.title}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={s.settingsSection}>
        <Text style={[t.captionMedium, s.sectionTitle]}>APPEARANCE</Text>
        <Pressable
          style={({ pressed }) => [s.settingsRow, pressed && { opacity: 0.7 }]}
          onPress={toggleTheme}
        >
          <View style={s.settingsRowLeft}>
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

      <View style={s.settingsSection}>
        <Text style={[t.captionMedium, s.sectionTitle]}>DATA</Text>
        <Pressable
          style={({ pressed }) => [s.settingsRow, pressed && { opacity: 0.7 }]}
          onPress={() => setClearConfirm(true)}
        >
          <View style={s.settingsRowLeft}>
            <Trash2 size={20} color={colors.danger} />
            <View>
              <Text style={[t.bodyMedium, { color: colors.danger }]}>Clear chat history</Text>
              <Text style={[t.caption, { marginTop: 2 }]}>Delete all conversations</Text>
            </View>
          </View>
        </Pressable>
      </View>

      <Text style={[t.caption, s.settingsFooter]}>Zeno v1.0.0</Text>

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
    </View>
  );
}

export default function Sidebar({ visible, onClose, onNewChat, chats = [], onSelectChat, chatsLoading, activeChatId, onRenameChat, showSettings, onToggleSettings }: Props) {
  const router = useRouter();
  const colors = useColors();
  const scheme = useColorScheme();
  const tx = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentX = useRef(new Animated.Value(0)).current;
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuChat, setMenuChat] = useState<Chat | null>(null);
  const [deleteChat, setDeleteChat] = useState<Chat | null>(null);
  const renameInputRef = useRef<TextInput>(null);
  const t = typography(colors);

  useEffect(() => {
    const duration = 200;
    Animated.parallel([
      Animated.timing(tx, { toValue: visible ? 0 : -SIDEBAR_WIDTH, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: visible ? 1 : 0, duration, useNativeDriver: true }),
    ]).start();
    if (!visible) { setRenamingChatId(null); setRenameText(''); }
  }, [visible]);

  useEffect(() => {
    Animated.timing(contentX, {
      toValue: showSettings ? -SIDEBAR_WIDTH : 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [showSettings]);

  const handleBack = useCallback(() => {
    onToggleSettings?.();
  }, [onToggleSettings]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/sign-in');
  }

  function startRename(chat: Chat) {
    setRenamingChatId(chat.id); setRenameText(chat.title || '');
    setTimeout(() => renameInputRef.current?.focus(), 100);
  }

  async function saveRename(chatId: string) {
    const trimmed = renameText.trim();
    if (!trimmed || trimmed === chats.find((c) => c.id === chatId)?.title) { setRenamingChatId(null); return; }
    const { error } = await supabase.from('chats').update({ title: trimmed }).eq('id', chatId);
    if (error) { console.log('Rename error', error); return; }
    onRenameChat?.(chatId, trimmed);
    setRenamingChatId(null);
  }

  function cancelRename() { setRenamingChatId(null); setRenameText(''); }

  function showMenu(chat: Chat) {
    setMenuChat(chat);
  }

  async function execDelete(chat: Chat) {
    await supabase.from('messages').delete().eq('chat_id', chat.id);
    await supabase.from('chats').delete().eq('id', chat.id);
    setDeleteChat(null);
  }

  function renderChatItem(item: Chat) {
    const isActive = item.id === activeChatId;
    const isRenaming = item.id === renamingChatId;

    return (
      <Pressable
        style={({ pressed }) => [
          s.chatItem,
          isActive && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
          pressed && !isActive && { opacity: 0.7 },
        ]}
        onPress={() => { if (!isRenaming) onSelectChat?.(item); }}
        onLongPress={() => showMenu(item)}
      >
        <MessageSquare size={18} color={isActive ? colors.accent : colors.textMuted} />
        <View style={s.chatItemContent}>
          {isRenaming ? (
            <View style={s.renameRow}>
              <TextInput
                ref={renameInputRef}
                style={[s.renameInput, { color: colors.textPrimary, borderColor: colors.accent }]}
                value={renameText}
                onChangeText={setRenameText}
                onSubmitEditing={() => saveRename(item.id)}
                onBlur={() => saveRename(item.id)}
                selectTextOnFocus autoFocus
              />
              <Pressable onPress={() => saveRename(item.id)} hitSlop={hitSlop}>
                <Check size={16} color={colors.accent} />
              </Pressable>
              <Pressable onPress={cancelRename} hitSlop={hitSlop}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[t.bodyMedium, { color: isActive ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
                {item.title || 'New conversation'}
              </Text>
              <Text style={[t.caption, { marginTop: 2 }]}>{formatTime(item.updated_at)}</Text>
            </>
          )}
        </View>
        {!isRenaming && (
          <Pressable onPress={() => showMenu(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MoreHorizontal size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </Pressable>
    );
  }

  return (
    <>
      {visible && (
        <Animated.View style={[s.overlay, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)', opacity: overlayOpacity }]}>
          <Pressable style={s.overlayPress} onPress={onClose} />
          <Animated.View style={[s.sidebar, { backgroundColor: colors.sidebarBg }, softShadow(), { transform: [{ translateX: tx }] }]}>
            <Animated.View style={{ width: SIDEBAR_WIDTH, transform: [{ translateX: contentX }] }}>
              <View style={s.header}>
                <Text style={t.title}>Zeno</Text>
                <Pressable onPress={onClose} style={s.closeBtn} hitSlop={hitSlop}>
                  <X size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [s.newChatButton, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderColor: colors.composerBorder }, pressed && { opacity: 0.7 }]}
                onPress={onNewChat}
              >
                <Plus size={20} color={colors.accent} />
                <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>New conversation</Text>
              </Pressable>

              {chatsLoading ? (
                <View style={s.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : (
                <FlatList data={chats} keyExtractor={(item) => item.id} contentContainerStyle={s.chatList} keyboardShouldPersistTaps="handled" renderItem={({ item }) => renderChatItem(item)} />
              )}

              <Pressable
                style={({ pressed }) => [s.signOutButton, { borderTopColor: colors.composerBorder }, pressed && { opacity: 0.7 }]}
                onPress={signOut}
              >
                <LogOut size={18} color={colors.danger} />
                <Text style={[t.body, { color: colors.danger }]}>Sign out</Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={[s.settingsWrapper, { transform: [{ translateX: contentX.interpolate({ inputRange: [-SIDEBAR_WIDTH, 0], outputRange: [0, SIDEBAR_WIDTH] }) }] }]}>
              <SettingsPanel onBack={handleBack} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}

      <ActionDialog
        visible={!!menuChat}
        title={menuChat?.title || 'Chat'}
        actions={[
          { label: 'Rename', bold: true, onPress: () => { if (menuChat) startRename(menuChat); } },
          { label: 'Delete', destructive: true, onPress: () => setDeleteChat(menuChat) },
        ]}
        onClose={() => setMenuChat(null)}
      />

      <ActionDialog
        visible={!!deleteChat}
        title="Delete chat?"
        message={`Delete "${deleteChat?.title || 'Untitled'}"?`}
        actions={[
          { label: 'Cancel', onPress: () => setDeleteChat(null) },
          { label: 'Delete', destructive: true, onPress: () => { if (deleteChat) execDelete(deleteChat); } },
        ]}
        onClose={() => setDeleteChat(null)}
      />
    </>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100 },
  overlayPress: { ...StyleSheet.absoluteFill },
  sidebar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH, paddingTop: 56, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  newChatButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.sm, borderWidth: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatList: { paddingBottom: 8 },
  chatItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 8, borderRadius: radii.sm },
  chatItemContent: { flex: 1 },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  renameInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', fontSize: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.sm, borderWidth: 1, fontFamily: 'Inter_400Regular' },
  signOutButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 16, borderTopWidth: 1, marginTop: 8 },
  settingsPanel: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH },
  settingsSection: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  settingsRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingsFooter: { textAlign: 'center', marginTop: 24 },
  settingsWrapper: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH },
});
