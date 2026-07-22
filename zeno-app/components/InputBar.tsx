import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TextInput, StyleSheet, Animated, Easing, Pressable, Platform, Modal, TouchableOpacity, Text } from 'react-native';
import { Send, Plus, Globe, Mic } from 'lucide-react-native';
import { useColors, radii, softShadow, typography } from '../lib/theme';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  searchArmed?: boolean;
  onToggleSearch?: () => void;
  onStartRecording?: () => void;
  value?: string;
  onChangeText?: (text: string) => void;
};

function ThinkingDots() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 200),
        Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]))
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={td.container}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[td.dot, {
          opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }],
        }]} />
      ))}
    </View>
  );
}

const td = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#eee' },
});

export default function InputBar({ onSend, disabled, searchArmed, onToggleSearch, onStartRecording, value, onChangeText }: Props) {
  const colors = useColors();
  const t = typography(colors);
  const [text, setText] = useState('');
  const textRef = useRef('');
  const disabledRef = useRef(disabled);
  const [menuVisible, setMenuVisible] = useState(false);
  disabledRef.current = disabled;

  const isControlled = value !== undefined;
  const displayText = isControlled ? value : text;

  const handleSend = useCallback(() => {
    const trimmed = (isControlled ? value : textRef.current).trim();
    if (!trimmed || disabledRef.current) return;
    onSend(trimmed);
    if (!isControlled) {
      setText('');
      textRef.current = '';
    }
    if (onChangeText) onChangeText('');
  }, [onSend, isControlled, value, onChangeText]);

  function handleChangeText(val: string) {
    textRef.current = val;
    if (isControlled) {
      onChangeText?.(val);
    } else {
      setText(val);
    }
  }

  function handleKeyPress(e: any) {
    if (e.nativeEvent.key === 'Enter') {
      const isShift = Platform.OS === 'web' ? e.nativeEvent.shiftKey : false;
      if (!isShift) handleSend();
    }
  }

  function handlePlusPress() {
    setMenuVisible(true);
  }

  function handleSelectWebSearch() {
    setMenuVisible(false);
    onToggleSearch?.();
  }

  function handleSelectSpeech() {
    setMenuVisible(false);
    onStartRecording?.();
  }

  return (
    <>
      <View style={[s.wrapper, { backgroundColor: colors.composerBg, borderColor: colors.composerBorder }, softShadow()]}>
        <View style={s.container}>
          <Pressable
            style={({ pressed }) => [
              s.plusBtn,
              searchArmed && { backgroundColor: colors.accent },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handlePlusPress}
            disabled={disabled}
          >
            <Plus size={20} color={searchArmed ? '#fff' : colors.textMuted} />
          </Pressable>
          <View style={s.inputWrapper}>
            <TextInput
              style={[s.input, { color: colors.textPrimary }]}
              placeholder="Message Zeno…"
              placeholderTextColor={colors.textMuted}
              value={displayText}
              onChangeText={handleChangeText}
              onKeyPress={handleKeyPress}
              multiline
              editable={!disabled}
            />
          </View>
          <Pressable
            style={({ pressed }) => [
              s.sendButton,
              { backgroundColor: colors.accent },
              (!displayText.trim() || disabled) && s.sendButtonDisabled,
              pressed && !disabled && displayText.trim() && { opacity: 0.7 },
            ]}
            onPress={handleSend}
            disabled={!displayText.trim() || disabled}
          >
            {disabled ? <ThinkingDots /> : <Send size={20} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[s.sheet, { backgroundColor: colors.bg, borderColor: colors.composerBorder }]}>
            <Pressable
              style={({ pressed }) => [s.menuOption, pressed && { opacity: 0.7 }]}
              onPress={handleSelectWebSearch}
            >
              <View style={[s.menuIcon, searchArmed && { backgroundColor: colors.accent + '20' }]}>
                <Globe size={20} color={searchArmed ? colors.accent : colors.textMuted} />
              </View>
              <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>
                Web Search{searchArmed ? ' (active)' : ''}
              </Text>
            </Pressable>
            <View style={[s.menuDivider, { backgroundColor: colors.composerBorder }]} />
            <Pressable
              style={({ pressed }) => [s.menuOption, pressed && { opacity: 0.7 }]}
              onPress={handleSelectSpeech}
            >
              <View style={s.menuIcon}>
                <Mic size={20} color={colors.textMuted} />
              </View>
              <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Speech to Text</Text>
            </Pressable>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  wrapper: { borderWidth: 1, borderRadius: radii.md, marginHorizontal: 12, marginBottom: 12 },
  container: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 6 },
  plusBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, marginLeft: -1 },
  inputWrapper: { flex: 1 },
  input: { paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, maxHeight: 120, fontFamily: 'Inter_400Regular' },
  sendButton: { borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  sendButtonDisabled: { opacity: 0.3 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderRadius: radii.lg, paddingVertical: 8, width: 280, borderWidth: 1 },
  menuOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, gap: 14 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  menuDivider: { height: 1, marginHorizontal: 20 },
});
