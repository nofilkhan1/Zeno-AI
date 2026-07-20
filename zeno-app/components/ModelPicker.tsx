import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { MODELS } from '../lib/models';

type Props = {
  selected?: string;
  onSelect?: (id: string) => void;
};

export default function ModelPicker({ selected, onSelect }: Props) {
  const [visible, setVisible] = useState(false);
  const active = MODELS.find((m) => m.id === selected) || MODELS[0];

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setVisible(true)} activeOpacity={0.7}>
        <View style={styles.triggerDot} />
        <Text style={styles.triggerText} numberOfLines={1}>{active.label}</Text>
        <ChevronDown size={14} color="#666" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select a model</Text>
            <FlatList
              data={MODELS}
              keyExtractor={(item) => item.id}
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
                      <View style={[styles.optionDot, isActive && styles.optionDotActive]} />
                      <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>{item.label}</Text>
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
    backgroundColor: '#161622',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '82%',
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: '#2a2a44',
  },
  sheetTitle: {
    color: '#8888aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
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
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3a3a55',
  },
  optionDotActive: {
    backgroundColor: '#5b9aff',
  },
  optionLabel: {
    color: '#8888aa',
    fontSize: 15,
  },
  optionLabelActive: {
    color: '#f0f0f5',
    fontWeight: '500',
  },
});
