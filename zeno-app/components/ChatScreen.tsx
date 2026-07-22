import { useRef, useEffect, useState, useCallback } from 'react';
import { FlatList, View, StyleSheet, Text, Pressable, Animated, Easing, useColorScheme } from 'react-native';
import { X, Sparkles } from 'lucide-react-native';
import { Message } from '../lib/types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import VoiceRecorder from './VoiceRecorder';
import { useColors, typography, radii } from '../lib/theme';

type Props = {
  messages?: Message[];
  onSend?: (text: string) => void;
  sending?: boolean;
  sendError?: string | null;
  onDismissError?: () => void;
  chatModel?: string;
  searchArmed?: boolean;
  onToggleSearch?: () => void;
};

const ANIM_DURATION = 200;

function FadeSlideView({ children, index }: { children: React.ReactNode; index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: ANIM_DURATION,
      delay: index * 30,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

function ErrorBar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const colors = useColors();
  const scheme = useColorScheme();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: ANIM_DURATION, useNativeDriver: true }).start();
  }, []);
  function handleDismiss() {
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => onDismiss());
  }
  return (
    <Animated.View style={[s.errorBar, { opacity, backgroundColor: scheme === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.06)', borderColor: scheme === 'dark' ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)' }]}>
      <Text style={[s.errorText, { color: colors.danger }]} numberOfLines={2}>{message}</Text>
      <Pressable onPress={handleDismiss} style={s.errorDismiss}>
        <X size={18} color={colors.danger} />
      </Pressable>
    </Animated.View>
  );
}

export default function ChatScreen({ messages = [], onSend, sending, sendError, onDismissError, chatModel, searchArmed, onToggleSearch }: Props) {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const hasPendingAssistant = messages.some((m) => m.role === 'assistant' && !m.content);
  const listRef = useRef<FlatList>(null);
  const prevLen = useRef(0);

  const [isRecording, _setIsRecording] = useState(false);
  const [inputText, setInputText] = useState('');

  const setIsRecording = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof value === 'function' ? (value as (prev: boolean) => boolean)(isRecording) : value;
    console.log('[STT-PARENT] setIsRecording(' + resolved + ') stack:', new Error().stack?.split('\n').slice(2, 6).join(' | '));
    _setIsRecording(value);
  }, [isRecording]);

  useEffect(() => {
    if (messages.length > prevLen.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
    prevLen.current = messages.length;
  }, [messages.length]);

  function handleSend(text: string) {
    onSend?.(text);
  }

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {sendError && <ErrorBar message={sendError} onDismiss={onDismissError || (() => {})} />}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => {
          if (item.role === 'assistant' && !item.content) return null;
          return (
            <FadeSlideView index={index}>
              <MessageBubble role={item.role} content={item.content || ''} sources={item.sources} answeredByModel={item.answered_by_model} chatModel={chatModel} webSearch={item.used_web_search} />
            </FadeSlideView>
          );
        }}
        contentContainerStyle={[s.list, messages.length === 0 && s.listEmpty]}
        ListEmptyComponent={
          <View style={s.empty}>
            <Sparkles size={36} color={colors.accent} />
            <Text style={[t.title, { marginTop: 16, color: colors.textPrimary, textAlign: 'center' }]}>How can I help you today?</Text>
          </View>
        }
      />
      {hasPendingAssistant && (
        <View style={[s.thinkingBar, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.composerBorder }]}>
          <Sparkles size={16} color={colors.accent} />
          <Text style={[s.thinkingText, { color: colors.textMuted }]}>Thinking…</Text>
        </View>
      )}
      {isRecording ? (
        <VoiceRecorder
          onTranscript={(text) => setInputText(text)}
          onStop={() => setIsRecording(false)}
          onCancel={() => { setInputText(''); setIsRecording(false); }}
        />
      ) : (
        <InputBar
          onSend={handleSend}
          disabled={sending}
          searchArmed={searchArmed}
          onToggleSearch={onToggleSearch}
          onStartRecording={() => setIsRecording(true)}
          value={inputText}
          onChangeText={setInputText}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 16, marginTop: 8, borderRadius: radii.sm, borderWidth: 1 },
  errorText: { fontSize: 14, flex: 1, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  errorDismiss: { padding: 8 },
  thinkingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.sm, borderWidth: 1 },
  thinkingText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  list: { paddingTop: 8, paddingBottom: 8 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 24 },
});
