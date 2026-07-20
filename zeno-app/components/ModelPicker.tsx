import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

const DUMMY_MODELS = [
  { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (NVIDIA)' },
  { id: 'nvidia/llama-3.1-nemotron-70b', label: 'Nemotron 70B (NVIDIA)' },
  { id: 'mistralai/mistral-7b-instruct', label: 'Mistral 7B (NVIDIA)' },
];

type Props = {
  selected?: string;
  onSelect?: (id: string) => void;
};

export default function ModelPicker({ selected, onSelect }: Props) {
  const [visible, setVisible] = useState(false);
  const active = DUMMY_MODELS.find((m) => m.id === selected) || DUMMY_MODELS[0];

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setVisible(true)}>
        <Text style={styles.triggerText} numberOfLines={1}>{active.label}</Text>
        <ChevronDown size={16} color="#8888aa" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Model</Text>
            <FlatList
              data={DUMMY_MODELS}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.id === active.id && styles.optionActive]}
                  onPress={() => {
                    onSelect?.(item.id);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, item.id === active.id && styles.optionTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
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
    backgroundColor: '#252540',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  triggerText: {
    color: '#e0e0e5',
    fontSize: 14,
    maxWidth: 200,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxHeight: '60%',
  },
  sheetTitle: {
    color: '#f0f0f5',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },
  optionActive: {
    backgroundColor: '#2a2a4e',
  },
  optionText: {
    color: '#8888aa',
    fontSize: 16,
  },
  optionTextActive: {
    color: '#f0f0f5',
    fontWeight: '500',
  },
});
