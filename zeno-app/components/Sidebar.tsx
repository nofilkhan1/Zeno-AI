import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, Animated, StyleSheet } from 'react-native';
import { Plus, MessageSquare, X, LogOut } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

const DUMMY_CHATS = [
  { id: '1', title: 'Quantum Computing Explained' },
  { id: '2', title: 'Recipe Ideas' },
  { id: '3', title: 'Code Review Help' },
  { id: '4', title: 'Travel Planning' },
  { id: '5', title: 'Math Homework' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
};

const SIDEBAR_WIDTH = 280;

export default function Sidebar({ visible, onClose, onNewChat }: Props) {
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

            <FlatList
              data={DUMMY_CHATS}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.chatItem}>
                  <MessageSquare size={16} color="#8888aa" />
                  <Text style={styles.chatItemText} numberOfLines={1}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />

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
