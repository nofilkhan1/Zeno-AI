import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Animated, StyleSheet, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Plus, MessageSquare, X, LogOut, Trash2, Edit3 } from 'lucide-react-native';
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
};

const SIDEBAR_WIDTH = 280;

export default function Sidebar({ visible, onClose, onNewChat, chats = [], onSelectChat, chatsLoading }: Props) {
  const router = useRouter();
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : -SIDEBAR_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/sign-in');
  }

  function handleLongPress(chat: Chat) {
    Alert.alert(chat.title || 'Chat', undefined, [
      {
        text: 'Rename',
        onPress: () => promptRename(chat),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDelete(chat),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function promptRename(chat: Chat) {
    Alert.prompt(
      'Rename Chat',
      'Enter a new name for this chat:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (newName?: string) => {
            if (!newName?.trim()) return;
            const { error } = await supabase.from('chats').update({ title: newName.trim() }).eq('id', chat.id);
            if (error) Alert.alert('Error', 'Could not rename chat');
          },
        },
      ],
      'plain-text',
      chat.title
    );
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
              <TouchableOpacity onPress={onClose}>
                <X size={24} color="#8888aa" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.newChatButton} onPress={onNewChat}>
              <Plus size={20} color="#fff" />
              <Text style={styles.newChatText}>New Chat</Text>
            </TouchableOpacity>

            {chatsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#8888aa" />
              </View>
            ) : (
              <FlatList
                data={chats}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.chatItem}
                    onPress={() => onSelectChat?.(item)}
                    onLongPress={() => handleLongPress(item)}
                  >
                    <MessageSquare size={16} color="#8888aa" />
                    <Text style={styles.chatItemText} numberOfLines={1}>{item.title || 'New Chat'}</Text>
                  </TouchableOpacity>
                )}
              />
            )}

            <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
              <LogOut size={18} color="#ff6b6b" />
              <Text style={styles.signOutText}>Sign Out</Text>
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
    backgroundColor: '#1a1a2e',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  headerTitle: {
    color: '#f0f0f5',
    fontSize: 22,
    fontWeight: 'bold',
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    padding: 12,
    backgroundColor: '#252540',
    borderRadius: 8,
  },
  newChatText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  chatItemText: {
    color: '#c0c0d0',
    fontSize: 15,
    flex: 1,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  signOutText: {
    color: '#ff6b6b',
    fontSize: 15,
  },
});
