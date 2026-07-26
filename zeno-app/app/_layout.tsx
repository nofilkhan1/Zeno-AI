import { useEffect, useState } from 'react';
import { Slot, useRouter } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { View, ActivityIndicator, StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { ThemeProvider } from '../lib/theme';
import { addNotificationResponseListener } from '../lib/notifications';

export type AuthContextType = { session: Session | null };

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => { setSession(session); })
      .catch(() => {})
      .finally(() => setLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    return () => subscription.unsubscribe();
  }, []);
  return { session, loading };
}

export default function RootLayout() {
  const { loading } = useAuth();
  const scheme = useColorScheme();
  const router = useRouter();
  const [fontsLoaded, fontsError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_700Bold });
  const fontsReady = fontsLoaded || !!fontsError;

  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'daily_notification') {
        router.push('/(chat)/today');
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsReady || loading) {
    const bg = scheme === 'dark' ? '#2D2B28' : '#F5F4EF';
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg }}>
        <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={bg} />
        <ActivityIndicator size="large" color="#D97757" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
        <Slot />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
