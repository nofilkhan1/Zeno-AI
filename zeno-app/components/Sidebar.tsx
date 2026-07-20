import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Animated, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Plus, MessageSquare, X, LogOut, Check, MoreHorizontal } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Chat } from '../lib/types';

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
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const renameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : -SIDEBAR_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
    if (!visible) {
      setRenamingChatId(null);
      setRenameText('');
    }
  }, [visible]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/sign-in');
  }

  function startRename(chat: Chat) {
    setRenamingChatId(chat.id);
    setRenameText(chat.title || '');
    setTimeout(() => renameInputRef.current?.focus(), 100);
  }

  async function saveRename(chatId: string) {
    const trimmed = renameText.trim();
    if (!trimmed || trimmed === chats.find((c) => c.id === chatId)?.title) {
      setRenamingChatId(null);
      return;
    }
    const { error } = await supabase.from('chats').update({ title: trimmed }).eq('id', chatId);
    if (error) {
      Alert.alert('Error', 'Could not rename chat');
      return;
    }
    onRenameChat?.(chatId, trimmed);
    setRenamingChatId(null);
  }

  function cancelRename() {
    setRenamingChatId(null);
    setRenameText('');
  }

  function showMenu(chat: Chat) {
    Alert.alert(chat.title || 'Chat', undefined, [
      {
        text: 'Rename',
        onPress: () => startRename(chat),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDelete(chat),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmDelete(chat: Chat) {
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to delete "${chat.title || 'Untitled'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('messages').delete().eq('chat_id', chat.id);
            await supabase.from('chats').delete().eq('id', chat.id);
          },
        },
      ]
    );
  }

  function renderChatItem(item: Chat) {
    const isActive = item.id === activeChatId;
    const isRenaming = item.id === renamingChatId;

    return (
      <TouchableOpacity
        style={[styles.chatItem, isActive && styles.chatItemActive]}
        onPress={() => { if (!isRenaming) onSelectChat?.(item); }}
        onLongPress={() => showMenu(item)}
        activeOpacity={isRenaming ? 1 : 0.6}
      >
        <MessageSquare size={15} color={isActive ? '#5b9aff' : '#5a5a7a'} />
        <View style={styles.chatItemContent}>
          {isRenaming ? (
            <View style={styles.renameRow}>
              <TextInput
                ref={renameInputRef}
                style={styles.renameInput}
                value={renameText}
                onChangeText={setRenameText}
                onSubmitEditing={() => saveRename(item.id)}
                onBlur={() => saveRename(item.id)}
                selectTextOnFocus
                autoFocus
              />
              <TouchableOpacity onPress={() => saveRename(item.id)} style={styles.renameAction}>
                <Check size={16} color="#22c55e" />
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelRename} style={styles.renameAction}>
                <X size={16} color="#8888aa" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.chatItemTitle, isActive && styles.chatItemTitleActive]} numberOfLines={1}>
                {item.title || 'New conversation'}
              </Text>
              <Text style={styles.chatItemTime}>{formatTime(item.updated_at)}</Text>
            </>
          )}
        </View>
        {!isRenaming && (
          <TouchableOpacity onPress={() => showMenu(item)} style={styles.menuButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MoreHorizontal size={14} color="#555" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <>
      {visible && (
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <Animated.View
            style={[styles.sidebar, { transform: [{ translateX }] }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Zeno</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color="#8888aa" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.newChatButton} onPress={onNewChat}>
              <Plus size={18} color="#fff" />
              <Text style={styles.newChatText}>New conversation</Text>
            </TouchableOpacity>

            {chatsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#8888aa" />
              </View>
            ) : (
              <FlatList
                data={chats}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.chatList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => renderChatItem(item)}
              />
            )}

            <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
              <LogOut size={16} color="#ff6b6b" />
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#12121e',
    paddingTop: 54,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    color: '#f0f0f5',
    fontSize: 22,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1e1e32',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a44',
  },
  newChatText: {
    color: '#e0e0e5',
    fontSize: 15,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatList: {
    paddingBottom: 8,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  chatItemActive: {
    backgroundColor: '#1a1a30',
  },
  chatItemContent: {
    flex: 1,
  },
  chatItemTitle: {
    color: '#8888aa',
    fontSize: 14,
    marginBottom: 2,
  },
  chatItemTitleActive: {
    color: '#e0e0e5',
    fontWeight: '500',
  },
  chatItemTime: {
    color: '#555',
    fontSize: 11,
  },
  menuButton: {
    padding: 4,
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  renameInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    color: '#e0e0e5',
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  renameAction: {
    padding: 4,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e1e32',
    marginTop: 4,
  },
  signOutText: {
    color: '#ff6b6b',
    fontSize: 14,
  },
});
