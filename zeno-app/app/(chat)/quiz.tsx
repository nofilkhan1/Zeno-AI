import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
  useColorScheme, Modal, FlatList, TextInput,
} from 'react-native';
import { BookOpen, ChevronRight, RefreshCw, CheckCircle, XCircle, Search, BarChart3, RotateCcw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useColors, typography, radii, softShadow } from '../../lib/theme';
import SURAHS from '../../lib/surahs';

const QUIZ_FN = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-quiz`;

type QuestionType = 'complete' | 'surah' | 'translation';

type QuizQuestion = {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  verseKey: string;
  arabic?: string;
  translation?: string;
};

type Screen = 'setup' | 'quiz' | 'results';

const TYPE_LABELS: Record<QuestionType, string> = {
  complete: 'Complete the Verse',
  surah: 'Which Surah?',
  translation: 'Translation Match',
};

const COUNT_OPTIONS = [5, 10, 20];

export default function QuizScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>('setup');
  const [scopeSurah, setScopeSurah] = useState<number | null>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [showSurahPicker, setShowSurahPicker] = useState(false);
  const [surahSearch, setSurahSearch] = useState('');

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const question = questions[currentIndex];
  const isAnswered = answers[currentIndex] !== -1 && answers[currentIndex] !== undefined;
  const isCorrect = isAnswered && answers[currentIndex] === question?.correctIndex;
  const score = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
  const missed = questions.filter((q, i) => answers[i] !== q.correctIndex);

  async function generateQuiz(surah: number | null, count: number) {
    setQuizLoading(true);
    setQuizError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(QUIZ_FN, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', surah, count }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.questions?.length) throw new Error('No questions generated');
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(-1));
      setCurrentIndex(0);
      setScreen('quiz');
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Failed to generate quiz');
    } finally {
      setQuizLoading(false);
    }
  }

  async function saveResult() {
    setSaveLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(QUIZ_FN, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-result', score, total: questions.length, surah: scopeSurah }),
      });
    } catch { /* silent */ } finally {
      setSaveLoading(false);
    }
  }

  function handleAnswer(index: number) {
    if (isAnswered) return;
    setSelectedAnswer(index);
    setShowFeedback(true);
    const newAnswers = [...answers];
    newAnswers[currentIndex] = index;
    setAnswers(newAnswers);
  }

  function goNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowFeedback(false);
      setSelectedAnswer(null);
    } else {
      setScreen('results');
      saveResult();
    }
  }

  function retry() {
    setScreen('setup');
    setQuestions([]);
    setAnswers([]);
    setCurrentIndex(0);
    setShowFeedback(false);
    setSelectedAnswer(null);
  }

  function reviewVerse(verseKey: string) {
    router.push(`/quran?verse=${verseKey}`);
  }

  const surahInfo = scopeSurah ? SURAHS.find((s) => s.number === scopeSurah) : null;

  // ── Setup screen ──
  if (screen === 'setup') {
    return (
      <View style={[s.container, { backgroundColor: colors.bg }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={[t.title, { color: colors.textPrimary }]}>Quran Quiz</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[t.caption, { color: colors.textMuted }]}>Back</Text>
          </Pressable>
        </View>

        {/* Surah scope */}
        <Text style={[t.captionMedium, { color: colors.textMuted, marginBottom: 6 }]}>Scope</Text>
        <Pressable
          style={[s.optionCard, { borderColor: colors.composerBorder, backgroundColor: colors.surface }]}
          onPress={() => setShowSurahPicker(true)}
        >
          <BookOpen size={18} color={colors.accent} />
          <Text style={[t.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
            {surahInfo ? `${surahInfo.number}. ${surahInfo.name}` : 'All Surahs (Random)'}
          </Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>

        {/* Question count */}
        <Text style={[t.captionMedium, { color: colors.textMuted, marginTop: 20, marginBottom: 6 }]}>Number of Questions</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {COUNT_OPTIONS.map((n) => (
            <Pressable
              key={n}
              style={[s.countBtn, { borderColor: questionCount === n ? colors.accent : colors.composerBorder, backgroundColor: questionCount === n ? (scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent' }]}
              onPress={() => setQuestionCount(n)}
            >
              <Text style={[t.bodyMedium, { color: questionCount === n ? colors.accent : colors.textPrimary }]}>{n}</Text>
            </Pressable>
          ))}
        </View>

        {/* Start button */}
        <Pressable
          style={[s.startBtn, { backgroundColor: colors.accent }, quizLoading && { opacity: 0.5 }]}
          onPress={() => generateQuiz(scopeSurah, questionCount)}
          disabled={quizLoading}
        >
          {quizLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <BarChart3 size={20} color="#fff" />
              <Text style={[t.bodyMedium, { color: '#fff' }]}>Start Quiz</Text>
            </>
          )}
        </Pressable>

        {quizError && (
          <View style={[s.errorBox, { backgroundColor: scheme === 'dark' ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', borderColor: colors.danger }]}>
            <Text style={[t.caption, { color: colors.danger }]}>{quizError}</Text>
          </View>
        )}

        {/* Surah picker */}
        {showSurahPicker && (
          <Modal visible transparent animationType="fade" onRequestClose={() => { setShowSurahPicker(false); setSurahSearch(''); }}>
            <Pressable style={s.overlay} onPress={() => { setShowSurahPicker(false); setSurahSearch(''); }}>
              <View style={[s.sheet, { backgroundColor: colors.bg, borderColor: colors.composerBorder }]} onStartShouldSetResponder={() => true}>
                <View style={[s.searchRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
                  <Search size={16} color={colors.textMuted} />
                  <TextInput
                    style={[s.searchInput, { color: colors.textPrimary }]}
                    placeholder="Search surah..."
                    placeholderTextColor={colors.textMuted}
                    value={surahSearch}
                    onChangeText={setSurahSearch}
                    autoFocus
                  />
                </View>
                <FlatList
                  style={{ maxHeight: 380 }}
                  data={SURAHS.filter((s) => !surahSearch || s.name.toLowerCase().includes(surahSearch.toLowerCase()) || s.englishName.toLowerCase().includes(surahSearch.toLowerCase()))}
                  keyExtractor={(item) => String(item.number)}
                  renderItem={({ item }) => (
                    <Pressable
                      style={({ pressed }) => [s.surahOption, scopeSurah === item.number && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }, pressed && { opacity: 0.7 }]}
                      onPress={() => { setScopeSurah(item.number); setShowSurahPicker(false); setSurahSearch(''); }}
                    >
                      <Text style={[t.bodyMedium, { color: scopeSurah === item.number ? colors.accent : colors.textPrimary }]}>
                        {item.number}. {item.name}
                      </Text>
                      <Text style={[t.caption, { color: colors.textMuted }]}>{item.englishName}</Text>
                    </Pressable>
                  )}
                  ListHeaderComponent={() => (
                    <Pressable
                      style={({ pressed }) => [s.surahOption, !scopeSurah && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }, pressed && { opacity: 0.7 }]}
                      onPress={() => { setScopeSurah(null); setShowSurahPicker(false); setSurahSearch(''); }}
                    >
                      <Text style={[t.bodyMedium, { color: !scopeSurah ? colors.accent : colors.textPrimary }]}>All Surahs (Random)</Text>
                    </Pressable>
                  )}
                />
              </View>
            </Pressable>
          </Modal>
        )}
      </View>
    );
  }

  // ── Quiz screen ──
  if (screen === 'quiz') {
    return (
      <View style={[s.container, { backgroundColor: colors.bg }]}>
        {/* Progress bar */}
        <View style={[s.progressBar, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
          <View style={[s.progressFill, { width: `${((currentIndex + 1) / questions.length) * 100}%`, backgroundColor: colors.accent }]} />
        </View>
        <Text style={[t.caption, { color: colors.textMuted, textAlign: 'center', marginVertical: 6 }]}>
          Question {currentIndex + 1} of {questions.length}
          {scopeSurah && surahInfo ? ` — ${surahInfo.name}` : ''}
        </Text>

        {/* Question type label */}
        {question && (
          <View style={[s.typeBadge, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}>
            <Text style={[t.caption, { color: colors.textMuted }]}>{TYPE_LABELS[question.type]}</Text>
          </View>
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {/* Prompt */}
          {question && (
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
              <Text style={[t.body, { color: colors.textPrimary, lineHeight: 24, marginBottom: 12 }]}>
                {question.prompt}
              </Text>

              {question.arabic && (
                <Text style={[s.arabicText, { color: colors.textPrimary, marginTop: 8, marginBottom: 8 }]}>
                  {question.arabic}
                </Text>
              )}

              {question.translation && question.type !== 'translation' && (
                <Text style={[t.caption, { color: colors.textMuted, fontStyle: 'italic', marginTop: 4 }]}>
                  {question.translation.slice(0, 80)}{question.translation.length > 80 ? '…' : ''}
                </Text>
              )}
            </View>
          )}

          {/* Options */}
          {question && question.options.map((opt, i) => {
            const isSelected = selectedAnswer === i;
            const isOptionCorrect = i === question.correctIndex;
            let bgColor = 'transparent';
            let borderColor = colors.composerBorder;
            if (showFeedback) {
              if (isOptionCorrect) { bgColor = scheme === 'dark' ? 'rgba(22,163,74,0.15)' : 'rgba(22,163,74,0.1)'; borderColor = '#16a34a'; }
              else if (isSelected && !isOptionCorrect) { bgColor = scheme === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)'; borderColor = colors.danger; }
            }
            return (
              <Pressable
                key={i}
                style={[s.optionBtn, { backgroundColor: bgColor, borderColor, opacity: showFeedback && !isOptionCorrect && !isSelected ? 0.4 : 1 }]}
                onPress={() => handleAnswer(i)}
                disabled={showFeedback}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[t.body, { color: colors.textPrimary, lineHeight: 20 }]} numberOfLines={4}>{opt}</Text>
                </View>
                {showFeedback && isOptionCorrect && <CheckCircle size={20} color="#16a34a" />}
                {showFeedback && isSelected && !isOptionCorrect && <XCircle size={20} color={colors.danger} />}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Next / See Results */}
        {showFeedback && (
          <View style={[s.feedbackBar, { borderTopColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
            <View style={{ flex: 1 }}>
              <Text style={[t.captionMedium, { color: isCorrect ? '#16a34a' : colors.danger }]}>
                {isCorrect ? '✓ Correct!' : `✗ Incorrect — correct answer: ${question?.options[question?.correctIndex]}`}
              </Text>
            </View>
            <Pressable style={[s.nextBtn, { backgroundColor: colors.accent }]} onPress={goNext}>
              <Text style={[t.bodyMedium, { color: '#fff' }]}>
                {currentIndex < questions.length - 1 ? 'Next' : 'See Results'}
              </Text>
              <ChevronRight size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // ── Results screen ──
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const grade = pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good!' : pct >= 40 ? 'Fair' : 'Keep Practicing';

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={[t.heading, { color: colors.textPrimary }]}>Quiz Complete!</Text>
          <Text style={[t.caption, { color: colors.textMuted, marginTop: 4 }]}>
            {scopeSurah && surahInfo ? `${surahInfo.name} — ` : ''}{questions.length} questions
          </Text>
        </View>

        {/* Score circle */}
        <View style={[s.scoreCircle, { borderColor: colors.accent }]}>
          <Text style={[t.title, { color: colors.accent, fontSize: 32 }]}>{score}/{questions.length}</Text>
          <Text style={[t.caption, { color: colors.textMuted }]}>{pct}% — {grade}</Text>
        </View>

        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, marginTop: 16 }, softShadow()]}>
          <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 12 }]}>Summary</Text>
          <View style={s.summaryRow}>
            <CheckCircle size={16} color="#16a34a" />
            <Text style={[t.body, { color: colors.textPrimary, flex: 1, marginLeft: 8 }]}>Correct</Text>
            <Text style={[t.bodyMedium, { color: '#16a34a' }]}>{score}</Text>
          </View>
          <View style={[s.summaryRow, { marginTop: 8 }]}>
            <XCircle size={16} color={colors.danger} />
            <Text style={[t.body, { color: colors.textPrimary, flex: 1, marginLeft: 8 }]}>Incorrect</Text>
            <Text style={[t.bodyMedium, { color: colors.danger }]}>{questions.length - score}</Text>
          </View>
        </View>

        {/* Missed questions review */}
        {missed.length > 0 && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, marginTop: 12 }, softShadow()]}>
            <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 8 }]}>Review Missed Verses</Text>
            {missed.map((q, i) => {
              const qIndex = questions.indexOf(q);
              return (
                <Pressable
                  key={i}
                  style={[s.missedRow, i < missed.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.composerBorder }]}
                  onPress={() => reviewVerse(q.verseKey)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[t.caption, { color: colors.accent }]}>
                      {TYPE_LABELS[q.type]} — {q.verseKey}
                    </Text>
                    <Text style={[t.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
                      Your answer: {q.options[answers[qIndex]]?.slice(0, 60) || '—'}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Action buttons */}
        <View style={{ gap: 8, marginTop: 16 }}>
          <Pressable style={[s.startBtn, { backgroundColor: colors.accent }]} onPress={retry}>
            <RotateCcw size={18} color="#fff" />
            <Text style={[t.bodyMedium, { color: '#fff' }]}>Try Again</Text>
          </Pressable>
          <Pressable style={[s.startBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.composerBorder }]} onPress={() => router.back()}>
            <Text style={[t.bodyMedium, { color: colors.textPrimary }]}>Back to Quran</Text>
          </Pressable>
        </View>

        {saveLoading && <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 12 }} />}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderRadius: radii.lg, paddingVertical: 16, paddingHorizontal: 8, width: '85%', maxHeight: '75%', borderWidth: 1, overflow: 'hidden' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginHorizontal: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  surahOption: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.sm, marginVertical: 1 },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radii.md, borderWidth: 1 },
  countBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.sm, borderWidth: 1 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radii.md, marginTop: 24 },
  errorBox: { flexDirection: 'row', padding: 12, borderRadius: radii.sm, borderWidth: 1, marginTop: 12 },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  typeBadge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radii.sm, marginBottom: 8 },
  card: { borderRadius: radii.md, borderWidth: 1, padding: 16, marginBottom: 4 },
  arabicText: { fontFamily: 'Inter_400Regular', fontSize: 20, lineHeight: 34, textAlign: 'right', writingDirection: 'rtl' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radii.sm, borderWidth: 1, marginBottom: 8, minHeight: 48 },
  feedbackBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: 1 },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 20, borderRadius: radii.sm },
  scoreCircle: { alignSelf: 'center', width: 140, height: 140, borderRadius: 70, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  missedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
});
