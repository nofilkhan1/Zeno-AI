import { useEffect, useState } from 'react';
import { Slot } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { View, ActivityIndicator, StatusBar, useColorScheme } from 'react-native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { ThemeProvider } from '../lib/theme';

export type AuthContextType = { session: Session | null };

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    return () => subscription.unsubscribe();
  }, []);
  return { session, loading };
}

export default function RootLayout() {
  const { loading } = useAuth();
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_700Bold });

  if (!fontsLoaded || loading) {
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
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Slot />
    </ThemeProvider>
  );
}
