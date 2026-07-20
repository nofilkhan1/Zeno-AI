import { View, Text, StyleSheet, StatusBar, useColorScheme } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { palettes, typography } from '../../../lib/theme';

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams();
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? palettes.dark : palettes.light;
  const t = typography(colors);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <Text style={[t.body, { color: colors.textMuted }]}>Chat: {chatId}</Text>
    </View>
  );
}

const s = StyleSheet.create({ container: { flex: 1, justifyContent: 'center', alignItems: 'center' } });
