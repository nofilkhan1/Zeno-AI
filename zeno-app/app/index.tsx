import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StatusBar, useColorScheme } from 'react-native';
import { supabase } from '../lib/supabase';
import { palettes } from '../lib/theme';

export default function Index() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? palettes.dark : palettes.light;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/(chat)');
      else router.replace('/(auth)/sign-in');
    });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}
