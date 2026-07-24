import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function ChatLayout() {
  const router = useRouter();
  const colors = useColors();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!session) router.replace('/(auth)/sign-in');
        else setSession(session);
      })
      .catch(() => { router.replace('/(auth)/sign-in'); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!session) return null;

  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: colors.bg },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
      headerTitleStyle: { fontFamily: 'Inter_500Medium', fontSize: 16 },
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[chatId]" options={{ title: 'Chat', headerBackTitle: 'Back' }} />
      <Stack.Screen name="quran" options={{ title: 'Quran GPT', headerBackTitle: 'Back' }} />
    </Stack>
  );
}
