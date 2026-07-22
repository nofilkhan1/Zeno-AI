import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Linking, Pressable, Modal, Image, Dimensions, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Source } from '../lib/types';
import { useColors, typography, radii, softShadow } from '../lib/theme';
import { Copy, Check, Volume2, VolumeX } from 'lucide-react-native';
import { speak, stopTTS, subscribeToTTS, getTTSState } from '../lib/tts';

type Props = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Source[] | null;
  answeredByModel?: string | null;
  chatModel?: string;
  webSearch?: boolean | null;
  messageId?: string;
};

type Segment = { type: 'text'; text: string } | { type: 'citation'; index: number };

function parseCitations(content: string): Segment[] {
  const parts: Segment[] = [];
  const regex = /\[\s*(\d+)\s*\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'citation', index: parseInt(match[1], 10) });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: 'text', text: content }];
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return ''; }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POPUP_WIDTH = 260;

export default function MessageBubble({ role, content, sources, answeredByModel, chatModel, webSearch, messageId }: Props) {
  const colors = useColors();
  const t = typography(colors);
  const isUser = role === 'user';
  const hasSources = sources && sources.length > 0;
  const [popup, setPopup] = useState<{ index: number; x: number; y: number } | null>(null);
  const popupAnim = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const actionFade = useRef(new Animated.Value(0)).current;

  const segments = hasSources ? parseCitations(content) : [{ type: 'text' as const, text: content }];
  const selectedSource = popup && sources ? sources[popup.index - 1] : null;

  const popupLeft = popup ? Math.max(16, Math.min(popup.x - 16, SCREEN_WIDTH - POPUP_WIDTH - 16)) : 0;
  const popupTop = popup ? (popup.y > 300 ? popup.y - 130 : popup.y + 20) : 0;

  useEffect(() => {
    if (popup) {
      popupAnim.setValue(0);
      Animated.timing(popupAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      popupAnim.setValue(0);
    }
  }, [popup]);

  // Fade in action buttons after message renders
  useEffect(() => {
    Animated.timing(actionFade, { toValue: 1, duration: 250, delay: 200, useNativeDriver: true }).start();
  }, []);

  // Subscribe to global TTS state to sync across messages
  useEffect(() => {
    const unsub = subscribeToTTS((state, err) => {
      if (state === 'loading') {
        setTtsLoading(true);
        setTtsPlaying(false);
        setTtsError('');
      } else if (state === 'playing') {
        setTtsLoading(false);
        setTtsPlaying(true);
        setTtsError('');
      } else if (state === 'error') {
        setTtsLoading(false);
        setTtsPlaying(false);
        if (err) setTtsError(err);
      } else {
        setTtsLoading(false);
        setTtsPlaying(false);
        setTtsError('');
      }
    });
    return unsub;
  }, []);

  async function handleCopy() {
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handlePlay() {
    if (ttsPlaying || ttsLoading) {
      stopTTS();
      return;
    }
    setTtsError('');
    speak(content).catch((err) => {
      setTtsError(err instanceof Error ? err.message : 'TTS failed');
    });
  }

  const showAnsweredBy = !!answeredByModel && answeredByModel !== chatModel;
  const lastSegment = answeredByModel?.split('/').pop() || '';
  const showSearchLabel = webSearch || showAnsweredBy;

  if (isUser) {
    return (
      <View style={sr.userContainer}>
        <View style={[sr.userBubble, { backgroundColor: colors.userBubble }]}>
          <Text style={t.body}>{content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={sr.assistantContainer}>
      <Text style={t.body}>
        {segments.map((seg, i) => {
          if (seg.type === 'citation' && seg.index > 0 && sources && seg.index <= sources.length) {
            return (
              <Text
                key={i}
                style={[sr.citationMark, { color: colors.accent }]}
                onPress={(e) => {
                  const { pageX, pageY } = e.nativeEvent;
                  setPopup((prev) => prev && prev.index === seg.index ? null : { index: seg.index, x: pageX, y: pageY });
                }}
              >
                {seg.index}
              </Text>
            );
          }
          return <Text key={i}>{seg.type === 'text' ? seg.text : `[${(seg as any).index}]`}</Text>;
        })}
      </Text>

      {!hasSources && showSearchLabel && (
        <View style={[sr.webSearchBadge, { backgroundColor: colors.userBubble, borderColor: colors.composerBorder }]}>
          <Text style={[sr.badgeText, { color: colors.accent }]}>Web search</Text>
        </View>
      )}
      {showAnsweredBy && (
        <Text style={[sr.answeredBy, { color: colors.textMuted }]}>Answered using {lastSegment}{hasSources ? ' (web search)' : ''}</Text>
      )}
      {!showAnsweredBy && webSearch && (
        <Text style={[sr.answeredBy, { color: colors.textMuted }]}>Web search</Text>
      )}

      <Animated.View style={[sr.actions, { opacity: actionFade }]}>
        <Pressable
          style={({ pressed }) => [sr.actionBtn, pressed && { opacity: 0.6 }]}
          onPress={handleCopy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {copied ? (
            <Check size={15} color={colors.accent} />
          ) : (
            <Copy size={15} color={colors.textMuted} />
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [sr.actionBtn, pressed && { opacity: 0.6 }]}
          onPress={handlePlay}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {ttsLoading ? (
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>…</Text>
          ) : ttsPlaying ? (
            <VolumeX size={15} color={colors.accent} />
          ) : (
            <Volume2 size={15} color={colors.textMuted} />
          )}
        </Pressable>
      </Animated.View>

      {ttsError ? (
        <Text style={[sr.ttsError, { color: colors.danger }]}>{ttsError}</Text>
      ) : null}

      <Modal visible={!!popup} transparent animationType="fade" onRequestClose={() => setPopup(null)}>
        <View style={sr.popupContainer}>
          <Pressable style={sr.popupOverlay} onPress={() => setPopup(null)} />
          {selectedSource && popup && (
            <Animated.View style={[{ position: 'absolute', left: popupLeft, top: popupTop }, { opacity: popupAnim, transform: [{ scale: popupAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
              <Pressable
                style={[sr.popupCard, { backgroundColor: colors.dialogBg }, softShadow()]}
                onPress={() => { Linking.openURL(selectedSource.url); setPopup(null); }}
              >
                <Image
                  source={{ uri: getFaviconUrl(selectedSource.url) }}
                  style={sr.favicon}
                  onError={({ nativeEvent: { error } }) => {}}
                />
                <View style={sr.popupContent}>
                  <Text style={[sr.popupDomain, { color: colors.textMuted }]} numberOfLines={1}>
                    {extractDomain(selectedSource.url)}
                  </Text>
                  <Text style={[sr.popupTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {selectedSource.title}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const sr = StyleSheet.create({
  userContainer: { alignItems: 'flex-end', paddingHorizontal: 16, marginVertical: 8 },
  userBubble: { maxWidth: '80%', borderRadius: radii.md, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12 },
  assistantContainer: { paddingHorizontal: 16, marginVertical: 8 },
  citationMark: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_500Medium', marginLeft: 1 },
  answeredBy: { fontSize: 13, marginTop: 8, fontStyle: 'italic', fontFamily: 'Inter_400Regular' },
  webSearchBadge: { alignSelf: 'flex-start', marginTop: 8, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  actions: { flexDirection: 'row', gap: 4, marginTop: 8 },
  actionBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  ttsError: { fontSize: 11, marginTop: 4, fontFamily: 'Inter_400Regular' },
  popupContainer: { flex: 1 },
  popupOverlay: { ...StyleSheet.absoluteFill },
  popupCard: { flexDirection: 'row', alignItems: 'center', width: POPUP_WIDTH, padding: 12, borderRadius: radii.sm, gap: 10 },
  favicon: { width: 20, height: 20, borderRadius: 4 },
  popupContent: { flex: 1 },
  popupDomain: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  popupTitle: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18, marginTop: 2 },
});
