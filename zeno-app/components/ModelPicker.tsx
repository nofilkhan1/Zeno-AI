import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, SectionList, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { MODELS, Model } from '../lib/models';
import { useColors, typography, radii } from '../lib/theme';

type Props = { selected?: string; onSelect?: (id: string) => void };

const PUBLISHER_ORDER = ['Meta', 'Mistral', 'NVIDIA', 'Google', 'OpenAI', 'Qwen', 'Abacus AI', 'Poolside', 'Sarvam AI', 'Stepfun', 'Thinking Machines', 'Upstage'];

function inferPublisher(id: string): string {
  const pfx = id.split('/')[0];
  const map: Record<string, string> = { 'abacusai': 'Abacus AI', 'google': 'Google', 'meta': 'Meta', 'mistralai': 'Mistral', 'nvidia': 'NVIDIA', 'openai': 'OpenAI', 'poolside': 'Poolside', 'qwen': 'Qwen', 'sarvamai': 'Sarvam AI', 'stepfun-ai': 'Stepfun', 'thinkingmachines': 'Thinking Machines', 'upstage': 'Upstage' };
  return map[pfx] || pfx;
}

export default function ModelPicker({ selected, onSelect }: Props) {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const [visible, setVisible] = useState(false);
  const active = MODELS.find((m) => m.id === selected) || MODELS[0];

  const sections = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const m of MODELS) { const pub = inferPublisher(m.id); if (!groups[pub]) groups[pub] = []; groups[pub].push(m); }
    const sorted = Object.entries(groups).sort(([a], [b]) => { const ai = PUBLISHER_ORDER.indexOf(a); const bi = PUBLISHER_ORDER.indexOf(b); return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi); });
    return sorted.map(([title, data]) => ({ title, data }));
  }, []);

  return (
    <>
      <Pressable style={({ pressed }) => [s.trigger, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderColor: colors.composerBorder }, pressed && { opacity: 0.7 }]} onPress={() => setVisible(true)}>
        <View style={[s.dot, { backgroundColor: active.supportsTools ? colors.accent : colors.textMuted }]} />
        <Text style={[t.captionMedium, { color: colors.textPrimary, maxWidth: 160 }]} numberOfLines={1}>{active.label}</Text>
        <ChevronDown size={16} color={colors.textMuted} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={[s.sheet, { backgroundColor: colors.bg, borderColor: colors.composerBorder }]}>
            <Text style={[t.captionMedium, s.sheetTitle, { color: colors.textMuted }]}>Select a model</Text>
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              renderSectionHeader={({ section }) => <Text style={[s.sectionHeader, { color: colors.textMuted }]}>{section.title}</Text>}
              renderItem={({ item }) => {
                const isActive = item.id === active.id;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      s.option,
                      isActive && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                      pressed && !isActive && { opacity: 0.7 },
                    ]}
                    onPress={() => { onSelect?.(item.id); setVisible(false); }}
                  >
                    <View style={s.optionLeft}>
                      <View style={[s.optionDot, { backgroundColor: item.supportsTools ? colors.accent : colors.textMuted }]} />
                      <Text style={[t.bodyMedium, { color: isActive ? colors.textPrimary : colors.textMuted }]}>{item.label}</Text>
                    </View>
                    {isActive && <Check size={18} color={colors.accent} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm, gap: 8, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderRadius: radii.lg, paddingVertical: 16, paddingHorizontal: 8, width: '82%', maxHeight: '70%', borderWidth: 1, overflow: 'hidden' },
  sheetTitle: { textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8 },
  sectionHeader: { fontSize: 12, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.sm, marginVertical: 1, minHeight: 44 },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  optionDot: { width: 10, height: 10, borderRadius: 5 },
});
