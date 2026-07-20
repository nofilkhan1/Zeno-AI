import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Animated, StyleSheet, ActivityIndicator, TextInput, Pressable, useColorScheme } from 'react-native';
import ActionDialog from './ActionDialog';
import { Plus, MessageSquare, X, LogOut, Check, MoreHorizontal } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Chat } from '../lib/types';
import { useColors, typography, radii, softShadow, hitSlop } from '../lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chats?: Chat[];
  onSelectChat?: (chat: Chat) => void;
  chatsLoading?: boolean;
  activeChatId?: string | null;
  onRenameChat?: (chatId: string, newTitle: string) => void;
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

export default function Sidebar({ visible, onClose, onNewChat, chats = [], onSelectChat, chatsLoading, activeChatId, onRenameChat }: Props) {
  const router = useRouter();
  const colors = useColors();
  const scheme = useColorScheme();
  const tx = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuChat, setMenuChat] = useState<Chat | null>(null);
  const [deleteChat, setDeleteChat] = useState<Chat | null>(null);
  const renameInputRef = useRef<TextInput>(null);
  const t = typography(colors);

  useEffect(() => {
    Animated.timing(tx, { toValue: visible ? 0 : -SIDEBAR_WIDTH, duration: 220, useNativeDriver: true }).start();
    if (!visible) { setRenamingChatId(null); setRenameText(''); }
  }, [visible]);

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
        <Pressable style={[s.overlay, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)' }]} onPress={onClose}>
          <Animated.View style={[s.sidebar, { backgroundColor: colors.sidebarBg }, softShadow(), { transform: [{ translateX: tx }] }]}>
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
        </Pressable>
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
  sidebar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  newChatButton: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.sm, borderWidth: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatList: { paddingBottom: 8 },
  chatItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 20, marginHorizontal: 8, borderRadius: radii.sm },
  chatItemContent: { flex: 1 },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  renameInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', fontSize: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.sm, borderWidth: 1, fontFamily: 'Inter_400Regular' },
  signOutButton: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, borderTopWidth: 1, marginTop: 4 },
});
