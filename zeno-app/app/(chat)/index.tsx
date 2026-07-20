import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Menu } from 'lucide-react-native';
import Sidebar from '../../components/Sidebar';
import ChatScreen from '../../components/ChatScreen';
import ModelPicker from '../../components/ModelPicker';

export default function ChatListScreen() {
  const [sidebarVisible, setSidebarVisible] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSidebarVisible(true)} style={styles.menuButton}>
          <Menu size={24} color="#e0e0e5" />
        </TouchableOpacity>
        <ModelPicker />
      </View>
      <ChatScreen />
      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        onNewChat={() => setSidebarVisible(false)}
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
