import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TextInput, StyleSheet, Animated, Easing, Pressable, Platform } from 'react-native';
import { Send, Globe } from 'lucide-react-native';
import { useColors, radii, softShadow } from '../lib/theme';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  onGlobePress?: () => void;
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

export default function InputBar({ onSend, disabled, onGlobePress }: Props) {
  const colors = useColors();
  const [text, setText] = useState('');
  const textRef = useRef('');
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const handleSend = useCallback(() => {
    const trimmed = textRef.current.trim();
    if (!trimmed || disabledRef.current) return;
    onSend(trimmed);
    setText('');
    textRef.current = '';
  }, [onSend]);

  function handleChangeText(val: string) {
    textRef.current = val;
    setText(val);
  }

  function handleKeyPress(e: any) {
    if (e.nativeEvent.key === 'Enter') {
      const isShift = Platform.OS === 'web' ? e.nativeEvent.shiftKey : false;
      if (!isShift) {
        handleSend();
      }
    }
  }

  return (
    <View style={[s.wrapper, { backgroundColor: colors.composerBg, borderColor: colors.composerBorder }, softShadow()]}>
      <View style={s.container}>
        <Pressable
          style={({ pressed }) => [
            s.globeBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onGlobePress}
          disabled={disabled}
        >
          <Globe size={20} color={colors.textMuted} />
        </Pressable>
        <View style={s.inputWrapper}>
          <TextInput
            style={[s.input, { color: colors.textPrimary }]}
            placeholder="Message Zeno…"
            placeholderTextColor={colors.textMuted}
            value={text}
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
            (!text.trim() || disabled) && s.sendButtonDisabled,
            pressed && !disabled && text.trim() && { opacity: 0.7 },
          ]}
          onPress={handleSend}
          disabled={!text.trim() || disabled}
        >
          {disabled ? <ThinkingDots /> : <Send size={20} color="#fff" />}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderRadius: radii.md,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  globeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  inputWrapper: { flex: 1 },
  input: {
    paddingHorizontal: 10,
    paddingVertical: 11,
    fontSize: 16,
    maxHeight: 120,
    fontFamily: 'Inter_400Regular',
  },
  sendButton: {
    borderRadius: 22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sendButtonDisabled: {
    opacity: 0.3,
  },
});
