import { useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, Animated, StyleSheet, useColorScheme } from 'react-native';
import { useColors, typography, radii } from '../lib/theme';

export type Action = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  bold?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  actions: Action[];
  onClose: () => void;
};

export default function ActionDialog({ visible, title, message, actions, onClose }: Props) {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0);
      fade.setValue(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[s.overlay, { backgroundColor: colors.dialogOverlay, opacity: fade }]}>
        <Pressable style={s.overlayPress} onPress={onClose} />
        <Animated.View style={[s.dialog, { backgroundColor: colors.dialogBg, borderColor: colors.composerBorder, transform: [{ scale }] }]}>
          <Text style={[t.bodyMedium, s.title]}>{title}</Text>
          {message && <Text style={[t.body, s.message]}>{message}</Text>}
          <View style={[s.actions, { borderTopColor: colors.composerBorder }]}>
            {actions.map((a, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  s.actionBtn,
                  i < actions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.composerBorder },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => { onClose(); a.onPress(); }}
              >
                <Text style={[
                  t.bodyMedium,
                  { color: a.destructive ? colors.danger : a.bold ? colors.accent : colors.textPrimary, textAlign: 'center' },
                ]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlayPress: { ...StyleSheet.absoluteFill },
  dialog: { width: '78%', borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  title: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 4, textAlign: 'center' },
  message: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  actions: { borderTopWidth: 1 },
  actionBtn: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
});
