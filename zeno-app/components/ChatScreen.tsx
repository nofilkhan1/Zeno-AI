import { FlatList, View, StyleSheet, Text, Pressable, useColorScheme } from 'react-native';
import { X, Sparkles } from 'lucide-react-native';
import { Message } from '../lib/types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import ModeTabs from './ModeTabs';
import { useColors, typography, radii } from '../lib/theme';

type Props = {
  messages?: Message[];
  onSend?: (text: string) => void;
  sending?: boolean;
  sendError?: string | null;
  onDismissError?: () => void;
  chatModel?: string;
  forceSearch?: boolean;
  onForceSearchChange?: (v: boolean) => void;
};

export default function ChatScreen({ messages = [], onSend, sending, sendError, onDismissError, chatModel, forceSearch, onForceSearchChange }: Props) {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const hasPendingAssistant = messages.some((m) => m.role === 'assistant' && !m.content);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {sendError ? (
        <View style={[s.errorBar, { backgroundColor: scheme === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.06)', borderColor: scheme === 'dark' ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)' }]}>
          <Text style={[s.errorText, { color: colors.danger }]} numberOfLines={2}>{sendError}</Text>
          <Pressable onPress={onDismissError} style={s.errorDismiss}>
            <X size={18} color={colors.danger} />
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.role === 'assistant' && !item.content) return null;
          return <MessageBubble role={item.role} content={item.content || ''} sources={item.sources} answeredByModel={item.answered_by_model} chatModel={chatModel} />;
        }}
        contentContainerStyle={[s.list, messages.length === 0 && s.listEmpty]}
        ListEmptyComponent={
          <View style={s.empty}>
            <Sparkles size={36} color={colors.accent} />
            <Text style={[t.title, { marginTop: 16, color: colors.textPrimary, textAlign: 'center' }]}>How can I help you today?</Text>
            <View style={{ marginTop: 20 }}>
              <ModeTabs active={forceSearch ? 'search' : 'normal'} onChange={(mode) => onForceSearchChange?.(mode === 'search')} />
            </View>
          </View>
        }
      />
      {hasPendingAssistant && (
        <View style={[s.thinkingBar, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.composerBorder }]}>
          <Sparkles size={16} color={colors.accent} />
          <Text style={[s.thinkingText, { color: colors.textMuted }]}>Thinking…</Text>
        </View>
      )}
      <InputBar
        onSend={(text) => onSend?.(text)}
        disabled={sending}
        forceSearch={forceSearch}
        onForceSearchToggle={() => onForceSearchChange?.(!forceSearch)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 14, marginTop: 8, borderRadius: radii.sm, borderWidth: 1 },
  errorText: { fontSize: 14, flex: 1, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  errorDismiss: { padding: 8 },
  thinkingBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.sm, borderWidth: 1 },
  thinkingText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  list: { paddingTop: 8, paddingBottom: 8 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 24 },
});
