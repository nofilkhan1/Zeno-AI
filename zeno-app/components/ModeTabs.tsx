import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useColors, typography, radii } from '../lib/theme';

type Props = {
  active: 'normal' | 'search';
  onChange: (mode: 'normal' | 'search') => void;
};

export default function ModeTabs({ active, onChange }: Props) {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);

  return (
    <View style={[s.container, { borderColor: colors.composerBorder, backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }]}>
      <Pressable
        style={({ pressed }) => [
          s.tab,
          active === 'normal' && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onChange('normal')}
      >
        <Text style={[t.bodyMedium, { color: active === 'normal' ? colors.textPrimary : colors.textMuted }]}>
          Normal
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          s.tab,
          active === 'search' && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onChange('search')}
      >
        <Text style={[t.bodyMedium, { color: active === 'search' ? colors.textPrimary : colors.textMuted }]}>
          Search
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flexDirection: 'row', borderWidth: 1, borderRadius: radii.sm, alignSelf: 'center', overflow: 'hidden' },
  tab: { paddingHorizontal: 20, paddingVertical: 8, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
