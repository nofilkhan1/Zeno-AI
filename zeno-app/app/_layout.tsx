import { useEffect, useState } from 'react';
import { Slot, useRouter } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { ThemeProvider, useThemeMode } from '../lib/theme';
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
  const [fontsLoaded, fontsError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_700Bold });
  const fontsReady = fontsLoaded || !!fontsError;

  return (
    <ThemeProvider>
      <RootLayoutContent loading={loading} fontsReady={fontsReady} />
    </ThemeProvider>
  );
}

function RootLayoutContent({ loading, fontsReady }: { loading: boolean; fontsReady: boolean }) {
  const router = useRouter();
  const { colors, resolved } = useThemeMode();

  useEffect(() => {
    let disposed = false;
    let sub: { remove: () => void } | null = null;

    void addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'daily_notification') router.push('/(chat)/today');
    }).then((listener) => {
      if (disposed) listener.remove();
      else sub = listener;
    });

    return () => {
      disposed = true;
      sub?.remove();
    };
  }, [router]);

  if (!fontsReady || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <Slot />
    </SafeAreaProvider>
  );
}
