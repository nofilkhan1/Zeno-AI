import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, SectionList, StyleSheet } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { MODELS, Model } from '../lib/models';

type Props = {
  selected?: string;
  onSelect?: (id: string) => void;
};

const PUBLISHER_ORDER = ['Meta', 'Mistral', 'NVIDIA', 'Google', 'OpenAI', 'Qwen', 'Abacus AI', 'Poolside', 'Sarvam AI', 'Stepfun', 'Thinking Machines', 'Upstage'];

function inferPublisher(id: string): string {
  const pfx = id.split('/')[0];
  const map: Record<string, string> = {
    'abacusai': 'Abacus AI', 'google': 'Google', 'meta': 'Meta',
    'mistralai': 'Mistral', 'nvidia': 'NVIDIA', 'openai': 'OpenAI',
    'poolside': 'Poolside', 'qwen': 'Qwen', 'sarvamai': 'Sarvam AI',
    'stepfun-ai': 'Stepfun', 'thinkingmachines': 'Thinking Machines',
    'upstage': 'Upstage',
  };
  return map[pfx] || pfx;
}

export default function ModelPicker({ selected, onSelect }: Props) {
  const [visible, setVisible] = useState(false);
  const active = MODELS.find((m) => m.id === selected) || MODELS[0];

  const sections = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const m of MODELS) {
      const pub = inferPublisher(m.id);
      if (!groups[pub]) groups[pub] = [];
      groups[pub].push(m);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => {
      const ai = PUBLISHER_ORDER.indexOf(a);
      const bi = PUBLISHER_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return sorted.map(([title, data]) => ({ title, data }));
  }, []);

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setVisible(true)} activeOpacity={0.7}>
        <View style={[styles.triggerDot, active.supportsTools && styles.triggerDotTools]} />
        <Text style={styles.triggerText} numberOfLines={1}>{active.label}</Text>
        <ChevronDown size={14} color="#666" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select a model</Text>
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              renderSectionHeader={({ section }) => (
                <Text style={styles.sectionHeader}>{section.title}</Text>
              )}
              renderItem={({ item }) => {
                const isActive = item.id === active.id;
                return (
                  <TouchableOpacity
                    style={[styles.option, isActive && styles.optionActive]}
                    onPress={() => {
                      onSelect?.(item.id);
                      setVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionLeft}>
                      <View style={[styles.optionDot, item.supportsTools && styles.optionDotTools, isActive && styles.optionDotActive]} />
                      <View style={styles.optionTextBlock}>
                        <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>{item.label}</Text>
                      </View>
                    </View>
                    {isActive && <Check size={16} color="#5b9aff" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a2a44',
  },
  triggerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  triggerDotTools: {
    backgroundColor: '#22c55e',
  },
  triggerText: {
    color: '#b0b0c0',
    fontSize: 13,
    maxWidth: 160,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#12121e',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '82%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#2a2a44',
  },
  sheetTitle: {
    color: '#8888aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 1,
  },
  optionActive: {
    backgroundColor: '#1a1a30',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  optionTextBlock: {
    flex: 1,
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3a3a55',
  },
  optionDotTools: {
    backgroundColor: '#22c55e',
  },
  optionDotActive: {
    backgroundColor: '#5b9aff',
  },
  optionLabel: {
    color: '#c0c0d0',
    fontSize: 14,
  },
  optionLabelActive: {
    color: '#f0f0f5',
    fontWeight: '500',
  },
});
