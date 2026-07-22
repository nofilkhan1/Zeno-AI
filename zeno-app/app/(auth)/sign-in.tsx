import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Pressable, StatusBar, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useColors, typography, radii } from '../../lib/theme';

export default function SignInScreen() {
  const router = useRouter();
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function signIn() {
    setLoading(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErrorMsg(error.message); return; }
      router.replace('/(chat)');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setLoading(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setErrorMsg(error.message); return; }
      // no need for native alert on success — user can check their email
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <Text style={[t.title, { textAlign: 'center', marginBottom: 48 }]}>Zeno</Text>
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.composerBorder }]} placeholder="Email" placeholderTextColor={colors.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.composerBorder }]} placeholder="Password" placeholderTextColor={colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry />
        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 16 }} />
        ) : (
          <View style={s.buttonRow}>
            <Pressable style={({ pressed }) => [s.button, { backgroundColor: colors.accent }, pressed && { opacity: 0.7 }]} onPress={signIn}>
              <Text style={[t.bodyMedium, { color: '#fff' }]}>Sign In</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [s.buttonOutline, { borderColor: colors.composerBorder }, pressed && { opacity: 0.7 }]} onPress={signUp}>
              <Text style={[t.bodyMedium, { color: colors.accent }]}>Sign Up</Text>
            </Pressable>
          </View>
        )}
        {errorMsg ? (
          <Text style={[t.caption, { color: colors.danger, textAlign: 'center', marginTop: 12 }]}>{errorMsg}</Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { borderRadius: radii.md, padding: 24, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: radii.sm, padding: 14, fontSize: 16, marginBottom: 12, fontFamily: 'Inter_400Regular' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: { flex: 1, padding: 14, borderRadius: radii.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  buttonOutline: { flex: 1, borderWidth: 1, padding: 14, borderRadius: radii.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
