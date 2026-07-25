import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, useColorScheme, Keyboard } from 'react-native';
import { Search, BookOpen, AlertCircle, HelpCircle, Volume2, Library, Hash } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useColors, typography, radii, softShadow } from '../../lib/theme';
import QuranAudioPlayer from '../../components/QuranAudioPlayer';

const LOOKUP_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-lookup`;
const ANSWER_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/quran-answer`;
const HADITH_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/hadith-search`;

const SEARCH_LANGUAGES = [
  { key: 'sahih_international', label: 'English (Sahih)' },
  { key: 'pickthall', label: 'English (Pickthall)' },
  { key: 'yusuf_ali', label: 'English (Yusuf Ali)' },
  { key: 'urdu', label: 'Urdu' },
  { key: 'indonesian', label: 'Indonesian' },
  { key: 'french', label: 'French' },
  { key: 'german', label: 'German' },
  { key: 'bengali', label: 'Bengali' },
  { key: 'spanish', label: 'Spanish' },
];

const HADITH_COLLECTIONS = [
  { key: '', label: 'All Collections' },
  { key: 'bukhari', label: 'Bukhari' },
  { key: 'muslim', label: 'Muslim' },
  { key: 'abudawud', label: 'Abu Dawud' },
  { key: 'tirmidhi', label: 'Tirmidhi' },
  { key: 'ibnmajah', label: 'Ibn Majah' },
  { key: 'nasai', label: "Nasai" },
  { key: 'malik', label: 'Malik' },
];

type Mode = 'quran' | 'hadith';

type FigureInfo = {
  name: string;
  description: string;
  knownFor: string;
  quranMention?: string;
  hadithRef?: string;
};

type QuranResult = {
  surah?: { number: number; name_english: string; name_translation: string };
  arabic: string;
  transliteration?: string;
  translation: string;
  translationKey?: string;
  verseKey: string;
};

type SearchResult = {
  verseKey: string;
  surahNumber: number;
  surahName: string;
  ayah: number;
  arabic: string;
  translation: string;
  translationSource: string;
};

type HadithResult = {
  id: string;
  collection: string;
  collectionName: string;
  hadithNumber: number;
  arabic?: string;
  english: string;
  grade: string;
};

type TafsirResult = {
  key: string;
  name: string;
  author: string;
  text: string;
};

type TafsirResponse = {
  source: string;
  author: string;
  text: string;
};

type ConfidenceLevel = 'green' | 'yellow' | 'orange' | 'red';

const TAFSIR_SOURCES = [
  { key: 'ibn_kathir', label: 'Ibn Kathir (Abridged)', author: 'Hafiz Ibn Kathir' },
  { key: 'maarif', label: "Ma'arif al-Qur'an", author: 'Mufti Muhammad Shafi' },
  { key: 'muyassar', label: 'Tafsir Muyassar', author: 'Ministry of Islamic Affairs, Saudi Arabia' },
];

const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; color: string; darkColor: string }> = {
  green: { label: 'Direct Evidence', color: '#16a34a', darkColor: '#4ade80' },
  yellow: { label: 'General Understanding', color: '#ca8a04', darkColor: '#facc15' },
  orange: { label: 'Limited Evidence', color: '#ea580c', darkColor: '#fb923c' },
  red: { label: 'No Clear Evidence', color: '#dc2626', darkColor: '#f87171' },
};

const STOPWORDS = new Set([
  'what', 'is', 'the', 'does', 'say', 'about', 'in', 'and', 'of', 'to',
  'a', 'an', 'are', 'how', 'why', 'when', 'where', 'who', 'which', 'do',
  'does', 'did', 'has', 'have', 'had', 'can', 'could', 'will', 'would',
  'should', 'may', 'might', 'shall', 'that', 'this', 'these', 'those',
  'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
  'he', 'she', 'him', 'her', 'his', 'me', 'my', 'i', 'not', 'no',
  'or', 'but', 'if', 'then', 'than', 'so', 'as', 'with', 'without',
  'all', 'any', 'some', 'each', 'every', 'both', 'neither', 'either',
  'by', 'for', 'on', 'at', 'from', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
  'again', 'further', 'once', 'here', 'there', 'tell', 'me', 'explain',
  'ruling', 'rulings', 'concept', 'meaning', 'definition',
]);

function extractKeywords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function isQuestion(input: string): boolean {
  const trimmed = input.trim();
  if (/^\d+\s*[:.]\s*\d+$/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  const questionStarts = ['what', 'why', 'how', 'does', 'do', 'is', 'are', 'can', 'should', 'would', 'could', 'tell', 'explain'];
  const startsWithQW = questionStarts.some((w) => lower.startsWith(w));
  if (startsWithQW) return true;
  const words = trimmed.split(/\s+/);
  return words.length >= 4;
}

const KNOWN_FIGURES: Record<string, FigureInfo> = {
  'muhammad': {
    name: 'Muhammad (ﷺ)',
    description: 'The final prophet and messenger of Allah, sent to all of humanity as a mercy to the worlds.',
    knownFor: 'Final messenger of Allah, Quran revealed to him, completed the religion of Islam',
    quranMention: 'Mentioned by name 4 times in the Quran; also referred to as "the Messenger", "the Prophet", "Ahmad"',
    hadithRef: 'Sahih al-Bukhari and Sahih Muslim are the most authentic collections of his sayings and actions',
  },
  'adam': {
    name: 'Adam (عليه السلام)',
    description: 'The first human being and first prophet of Allah, created from clay and given knowledge of all things.',
    knownFor: 'First human, first prophet, father of humanity',
    quranMention: 'Surah Al-Baqarah (2:30-38), Surah Al-A\'raf (7:11-25), Surah Ta-Ha (20:115-123)',
    hadithRef: 'Sahih al-Bukhari 3409 - Prophet ﷺ said: "Allah created Adam in His image"',
  },
  'ibrahim': {
    name: 'Ibrahim (عليه السلام)',
    description: 'Prophet Ibrahim (Abraham) — the patriarch of monotheism, known as Khalilullah (Friend of Allah). He built the Kaaba with his son Ismail.',
    knownFor: 'Father of monotheism, built the Kaaba, offered his son in obedience to Allah',
    quranMention: 'Mentioned in 25+ surahs; Surah Ibrahim (14), Surah Al-Baqarah 2:124-141',
    hadithRef: 'Sahih al-Bukhari 3364 - Prophet ﷺ said: "Ibrahim was the most truthful person"',
  },
  'musa': {
    name: 'Musa (عليه السلام)',
    description: 'Prophet Musa (Moses) — the most mentioned prophet in the Quran, given the Torah and sent to Pharaoh and Bani Israel.',
    knownFor: 'Received the Torah, split the sea, spoke directly to Allah',
    quranMention: 'Mentioned in 30+ surahs; Surah Al-Qasas (28), Surah Ta-Ha (20), Surah Al-A\'raf (7:103-162)',
  },
  'isa': {
    name: 'Isa (عليه السلام)',
    description: 'Prophet Isa (Jesus) — a mighty messenger of Allah, born miraculously to Maryam (Mary), given the Injeel (Gospel), and will return before the Day of Judgment.',
    knownFor: 'Born without a father, spoke in the cradle, raised the dead by Allah\'s permission, will return as a just ruler',
    quranMention: 'Mentioned in 10+ surahs; Surah Maryam (19:16-36), Surah Aal-e-Imran (3:45-59), Surah An-Nisa (4:157-159)',
    hadithRef: 'Sahih al-Bukhari 3448 - Prophet ﷺ said: "Isa will descend among you as a just ruler"',
  },
  'yusuf': {
    name: 'Yusuf (عليه السلام)',
    description: 'Prophet Yusuf (Joseph) — known for his beauty, patience, and forgiveness. A full surah (Surah Yusuf, 12) is named after his story.',
    knownFor: 'Interpretation of dreams, resisted temptation, forgave his brothers',
    quranMention: 'Surah Yusuf (12) — the longest continuous story in the Quran',
  },
  'nuh': {
    name: 'Nuh (عليه السلام)',
    description: 'Prophet Nuh (Noah) — called his people for 950 years, built the ark by Allah\'s command, and was saved with the believers from the great flood.',
    knownFor: 'Built the ark, called his people for 950 years, survived the great flood',
    quranMention: 'Surah Nuh (71), Surah Hud (11:25-49), Surah Al-Ankabut (29:14-15)',
  },
  'yunus': {
    name: 'Yunus (عليه السلام)',
    description: 'Prophet Yunus (Jonah) — swallowed by a great fish when he left his people in anger, then glorified Allah from the darkness.',
    knownFor: 'Swallowed by a whale, his prayer from the darkness, his people accepted after he left',
    quranMention: 'Surah Yunus (10), Surah Al-Anbiya (21:87-88), Surah As-Saffat (37:139-148)',
  },
  'maryam': {
    name: 'Maryam (Mary, عليها السلام)',
    description: 'Maryam bint Imran — the mother of Prophet Isa (Jesus), the most virtuous woman in Paradise. A full surah (Surah Maryam, 19) is named after her.',
    knownFor: 'Mother of Prophet Isa, chaste and devout, received provision from Allah in the mihrab',
    quranMention: 'Surah Maryam (19), Surah Aal-e-Imran (3:35-47) — a full surah named after her',
    hadithRef: 'Sahih al-Bukhari 3432 - "The best of women among the people of Paradise are Maryam bint Imran"',
  },
  'fatima': {
    name: 'Fatimah (رضي الله عنها)',
    description: 'Fatimah bint Muhammad — the youngest daughter of the Prophet ﷺ and Khadijah (RA), wife of Ali (RA), mother of Hasan and Husayn (RA). She is the leader of the women of Paradise.',
    knownFor: 'Daughter of Prophet ﷺ, wife of Ali, mother of Hasan and Husayn, leader of women of Paradise',
    quranMention: 'Referenced in Surah Al-Ahzab (33:33) as part of Ahl al-Bayt (the Prophet\'s household)',
    hadithRef: 'Sahih al-Bukhari 3504 - Prophet ﷺ said: "Fatimah is the leader of the women of Paradise"',
  },
  'khadijah': {
    name: 'Khadijah (رضي الله عنها)',
    description: 'Khadijah bint Khuwaylid — the first wife of Prophet ﷺ, the first person to accept Islam, and his greatest supporter. She was a wealthy businesswoman and a woman of noble character.',
    knownFor: 'First wife of Prophet ﷺ, first Muslim, mother of Fatimah (RA), supported the Prophet during the early revelation',
    quranMention: 'Referenced indirectly in Surah Ad-Duha (93) — Allah consoled the Prophet after her passing',
    hadithRef: 'Sahih Muslim 2430 - "The best of its women is Khadijah bint Khuwaylid"',
  },
  'aisha': {
    name: 'Aisha (رضي عنها)',
    description: 'Aisha bint Abu Bakr — the wife of Prophet ﷺ, known as Umm al-Mu\'mineen (Mother of the Believers). She was a scholar, narrator of thousands of hadith, and a leader in Islamic jurisprudence.',
    knownFor: 'Wife of Prophet ﷺ, narrated over 2,200 hadith, expert in fiqh and tafsir',
    quranMention: 'Surah An-Nur (24:11-20) relates to the incident of slander against her',
    hadithRef: 'Sahih al-Bukhari 3776 - "Take half of your religion from this Humayra (Aisha)"',
  },
  'abu_bakr': {
    name: 'Abu Bakr (رضي الله عنه)',
    description: 'Abu Bakr as-Siddiq — the first adult male to accept Islam, closest companion of Prophet ﷺ, first caliph of Islam. Known for his unwavering faith and generosity.',
    knownFor: 'First caliph, companion of the cave, father of Aisha (RA), freed Bilal (RA)',
    quranMention: 'Surah At-Tawbah (9:40) — "the second of the two when they were in the cave"',
    hadithRef: 'Sahih al-Bukhari 3660 - "If I were to take a close friend, I would take Abu Bakr"',
  },
  'umar': {
    name: 'Umar ibn al-Khattab (رضي الله عنه)',
    description: 'Umar al-Farooq — the second caliph of Islam, known for his strength, justice, and wisdom. His acceptance of Islam strengthened the Muslim community immensely.',
    knownFor: 'Second caliph, known as al-Farooq (the distinguisher), expanded the Islamic state, established the Hijri calendar',
    quranMention: 'Surah Al-Anfal (8:30) is said to reference his role, and several verses were revealed in agreement with his opinions',
    hadithRef: 'Sahih al-Bukhari 144 - "In every nation there is a Fitnah, and the Fitnah of my nation is wealth"',
  },
  'uthman': {
    name: 'Uthman ibn Affan (رضي الله عنه)',
    description: 'Uthman Dhun-Nurayn — the third caliph, known for his modesty, generosity, and compiling the standard Quranic text.',
    knownFor: 'Third caliph, compiled the Quran into one book, married to two daughters of Prophet ﷺ',
    quranMention: 'Surah Al-Fatihah and general verses about those who spend in charity',
    hadithRef: 'Sahih al-Bukhari 3695 - "Every prophet has a companion in Paradise, and my companion there will be Uthman"',
  },
  'ali': {
    name: 'Ali ibn Abi Talib (رضي الله عنه)',
    description: 'Ali — the cousin and son-in-law of Prophet ﷺ, fourth caliph, known for his bravery, knowledge, and eloquence. He grew up in the Prophet\'s household and was among the first to accept Islam.',
    knownFor: 'Fourth caliph, husband of Fatimah (RA), father of Hasan and Husayn, famously brave warrior',
    quranMention: 'Surah Al-Ma\'idah (5:55) and Surah At-Tahrim (66:4) are linked to events involving him',
    hadithRef: 'Sahih Muslim 2404 - "I am the city of knowledge and Ali is its gate"',
  },
  'hasan': {
    name: 'Hasan ibn Ali (رضي الله عنه)',
    description: 'Hasan — the grandson of Prophet ﷺ, son of Ali and Fatimah (RA). He was a caliph for a short period and abdicated to preserve Muslim unity.',
    knownFor: 'Grandson of Prophet ﷺ, abdicated caliphate to preserve unity, leader of the youth of Paradise',
    quranMention: 'Referenced as part of Ahl al-Bayt, Surah Al-Ahzab (33:33)',
    hadithRef: 'Sahih al-Bukhari 3623 - "Hasan and Husayn are the leaders of the youth of Paradise"',
  },
  'husayn': {
    name: 'Husayn ibn Ali (رضي الله عنه)',
    description: 'Husayn — the grandson of Prophet ﷺ, son of Ali and Fatimah (RA). He was martyred at Karbala and is deeply revered by Muslims.',
    knownFor: 'Grandson of Prophet ﷺ, martyred at Karbala, known for his stand against injustice',
    quranMention: 'Referenced as part of Ahl al-Bayt, Surah Al-Ahzab (33:33)',
    hadithRef: 'Sahih al-Bukhari 3623 - "Hasan and Husayn are the leaders of the youth of Paradise"',
  },
  'bilal': {
    name: 'Bilal ibn Rabah (رضي الله عنه)',
    description: 'Bilal — an Ethiopian companion, the first muezzin (caller to prayer) in Islam. He was a slave freed by Abu Bakr (RA) and was known for his beautiful voice.',
    knownFor: 'First muezzin of Islam, freed by Abu Bakr (RA), steadfast under persecution in Mecca',
    quranMention: 'Surah Al-Hujurat (49:13) — "Indeed the most noble of you in the sight of Allah is the most righteous"',
    hadithRef: 'Sahih al-Bukhari 182 - Bilal was appointed as the caller of the adhan by the Prophet ﷺ',
  },
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWhoIsQuestion(input: string): boolean {
  const lower = input.toLowerCase().trim();
  const whoPattern = /^(who)\s+(is|was)\s+(.+)$/i;
  const match = lower.match(whoPattern);
  if (match) {
    const name = normalizeName(match[3]).replace(/^(hazrat|imam|saint|prophet|sayyidina|syedina|syed)\s+/i, '');
    if (name && !['this', 'that', 'he', 'she', 'they', 'the best', 'your', 'the quran'].includes(name)) {
      return true;
    }
  }
  return false;
}

function extractNameFromWhoIs(input: string): string | null {
  const lower = input.toLowerCase().trim();
  const whoPattern = /^(who)\s+(is|was)\s+(.+)$/i;
  const match = lower.match(whoPattern);
  if (match) {
    const name = normalizeName(match[3]).replace(/^(hazrat|imam|saint|prophet|sayyidina|syedina|syed)\s+/i, '');
    const parts = name.split(/\s+/).slice(0, 3);
    return parts.length > 0 ? parts.join(' ') : null;
  }
  return null;
}

function lookUpFigure(name: string): FigureInfo | null {
  const normalized = normalizeName(name);
  const candidates = [normalized, ...normalized.split(/\s+/)];
  for (const key of candidates) {
    if (KNOWN_FIGURES[key]) return KNOWN_FIGURES[key];
  }
  return null;
}

export default function QuranScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const t = typography(colors);
  const [mode, setMode] = useState<Mode>('quran');
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('sahih_international');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ayahResult, setAyahResult] = useState<QuranResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const [tafsir, setTafsir] = useState<TafsirResult | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirSource, setTafsirSource] = useState('ibn_kathir');
  const [tafsirExpanded, setTafsirExpanded] = useState(false);
  const [tafsirError, setTafsirError] = useState<string | null>(null);

  const [answer, setAnswer] = useState<string | null>(null);
  const [answerConfidence, setAnswerConfidence] = useState<ConfidenceLevel | null>(null);
  const [answerQuranVerses, setAnswerQuranVerses] = useState<SearchResult[]>([]);
  const [answerHadiths, setAnswerHadiths] = useState<HadithResult[]>([]);
  const [answerTafsir, setAnswerTafsir] = useState<TafsirResponse | null>(null);
  const [noResults, setNoResults] = useState(false);

  const [hadithResults, setHadithResults] = useState<HadithResult[] | null>(null);
  const [hadithCollection, setHadithCollection] = useState('');
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [hadithTotalFound, setHadithTotalFound] = useState(0);
  const [figureResult, setFigureResult] = useState<FigureInfo | null>(null);
  const [keywordSearchWarning, setKeywordSearchWarning] = useState(false);

  function resetAll() {
    setAyahResult(null);
    setSearchResults(null);
    setError(null);
    setAnswer(null);
    setAnswerConfidence(null);
    setAnswerQuranVerses([]);
    setAnswerHadiths([]);
    setAnswerTafsir(null);
    setTafsir(null);
    setTafsirExpanded(false);
    setTafsirError(null);
    setNoResults(false);
    setHadithResults(null);
    setFigureResult(null);
    setKeywordSearchWarning(false);
  }

  async function handleAyahOrSearch(body: unknown) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(LOOKUP_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function handleHadithSearch(query: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(HADITH_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, collection: hadithCollection || undefined, limit: 15 }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function fetchTafsirForVerse(surah: number, ayah: number, source: string) {
    setTafsirLoading(true);
    setTafsirError(null);
    setTafsir(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const res = await fetch(LOOKUP_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'tafsir', surah, ayah, source }),
      });
      if (res.status === 404) {
        setTafsirError('Tafsir not available for this verse.');
        return;
      }
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setTafsir(data.tafsir as TafsirResult);
    } catch (err) {
      setTafsirError(err instanceof Error ? err.message : 'Failed to load tafsir');
    } finally {
      setTafsirLoading(false);
    }
  }

  async function handleQuestion(question: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(ANSWER_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, translation: language }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setLoading(true);
    resetAll();

    try {
      if (mode === 'hadith') {
        if (isWhoIsQuestion(trimmed)) {
          const name = extractNameFromWhoIs(trimmed);
          if (name) {
            const figure = lookUpFigure(name);
            if (figure) {
              setFigureResult(figure);
              setLoading(false);
              return;
            }
          }
          const data = await handleQuestion(trimmed);
          if (data.noResults) {
            setNoResults(true);
          } else {
            setAnswer(data.answer);
            setAnswerConfidence((data.confidence as ConfidenceLevel) || 'red');
            setAnswerQuranVerses(data.quranVerses || []);
            setAnswerHadiths(data.hadiths || []);
            setAnswerTafsir(data.tafsir || null);
            if (data.error && !data.answer) {
              setAnswer(null);
              setError(data.error);
            }
          }
        } else {
          const keywords = extractKeywords(trimmed);
          const searchQuery = keywords.length > 0 ? keywords.join(' ') : trimmed;
          console.log(`[Quran] Hadith search: raw="${trimmed}" → extracted=[${keywords.join(', ')}] → query="${searchQuery}"`);
          const data = await handleHadithSearch(searchQuery);
          setHadithResults(data.hadiths || []);
          setHadithTotalFound(data.totalFound || 0);
          if ((data.hadiths || []).length > 0 && !isQuestion(trimmed)) {
            setKeywordSearchWarning(true);
          }
          if ((data.hadiths || []).length === 0) {
            setNoResults(true);
          }
        }
      } else {
        const questionMode = isQuestion(trimmed);

        if (questionMode) {
          const data = await handleQuestion(trimmed);
          if (data.noResults) {
            setNoResults(true);
          } else {
            setAnswer(data.answer);
            setAnswerConfidence((data.confidence as ConfidenceLevel) || 'red');
            setAnswerQuranVerses(data.quranVerses || []);
            setAnswerHadiths(data.hadiths || []);
            setAnswerTafsir(data.tafsir || null);
            if (data.error && !data.answer) {
              setAnswer(null);
              setError(data.error);
            }
          }
        } else {
          const ayahMatch = trimmed.match(/^(\d+)\s*[:.]\s*(\d+)$/);
          const body = ayahMatch
            ? { type: 'ayah', surah: parseInt(ayahMatch[1]), ayah: parseInt(ayahMatch[2]), translation: language }
            : { type: 'search', query: trimmed, translation: language, limit: 10 };
          const data = await handleAyahOrSearch(body);
          if (ayahMatch) {
            setAyahResult(data as QuranResult);
          } else {
            setSearchResults(data.results as SearchResult[]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const currentLangLabel = SEARCH_LANGUAGES.find((l) => l.key === language)?.label || 'English (Sahih)';
  const confidenceMeta = answerConfidence ? CONFIDENCE_META[answerConfidence] : null;
  const currentCollectionLabel = HADITH_COLLECTIONS.find((c) => c.key === hadithCollection)?.label || 'All Collections';

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* ── Mode switcher ── */}
      <View style={[s.modeRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        <Pressable
          style={[s.modeTab, mode === 'quran' && { backgroundColor: colors.accent }]}
          onPress={() => { setMode('quran'); resetAll(); }}
        >
          <BookOpen size={14} color={mode === 'quran' ? '#fff' : colors.textMuted} />
          <Text style={[t.caption, { color: mode === 'quran' ? '#fff' : colors.textMuted }]}>Quran</Text>
        </Pressable>
        <Pressable
          style={[s.modeTab, mode === 'hadith' && { backgroundColor: colors.accent }]}
          onPress={() => { setMode('hadith'); resetAll(); }}
        >
          <Library size={14} color={mode === 'hadith' ? '#fff' : colors.textMuted} />
          <Text style={[t.caption, { color: mode === 'hadith' ? '#fff' : colors.textMuted }]}>Hadith</Text>
        </Pressable>
      </View>

      {/* ── Input row ── */}
      <View style={[s.inputRow, { borderColor: colors.composerBorder, backgroundColor: colors.composerBg }]}>
        {mode === 'hadith' ? (
          <Hash size={18} color={colors.textMuted} />
        ) : isQuestion(input) ? (
          <HelpCircle size={18} color={colors.textMuted} />
        ) : (
          <Search size={18} color={colors.textMuted} />
        )}
        <TextInput
          style={[s.input, { color: colors.textPrimary }]}
          placeholder={mode === 'hadith' ? "Search hadith (e.g. patience, charity)..." : "Verse (2:255), search, or ask..."}
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
        />
      </View>

      <View style={s.langRow}>
        {mode === 'hadith' ? (
          <Pressable
            style={[s.langButton, { borderColor: colors.composerBorder }]}
            onPress={() => setShowCollectionPicker(!showCollectionPicker)}
          >
            <Library size={14} color={colors.accent} />
            <Text style={[t.caption, { color: colors.textMuted }]}>{currentCollectionLabel}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[s.langButton, { borderColor: colors.composerBorder }]}
            onPress={() => setShowLangPicker(!showLangPicker)}
          >
            <BookOpen size={14} color={colors.accent} />
            <Text style={[t.caption, { color: colors.textMuted }]}>{currentLangLabel}</Text>
          </Pressable>
        )}
        <Pressable
          style={[s.submitBtn, { backgroundColor: colors.accent }, (!input.trim() || loading) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={!input.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[t.bodyMedium, { color: '#fff' }]}>Go</Text>
          )}
        </Pressable>
      </View>

      {mode === 'hadith' && showCollectionPicker && (
        <View style={[s.langPicker, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <ScrollView style={{ maxHeight: 200 }}>
            {HADITH_COLLECTIONS.map((col) => (
              <Pressable
                key={col.key}
                style={({ pressed }) => [
                  s.langOption,
                  hadithCollection === col.key && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { setHadithCollection(col.key); setShowCollectionPicker(false); }}
              >
                <Text style={[t.bodyMedium, { color: hadithCollection === col.key ? colors.accent : colors.textPrimary }]}>
                  {col.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {mode === 'quran' && showLangPicker && (
        <View style={[s.langPicker, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <ScrollView style={{ maxHeight: 200 }}>
            {SEARCH_LANGUAGES.map((lang) => (
              <Pressable
                key={lang.key}
                style={({ pressed }) => [
                  s.langOption,
                  language === lang.key && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { setLanguage(lang.key); setShowLangPicker(false); }}
              >
                <Text style={[t.bodyMedium, { color: language === lang.key ? colors.accent : colors.textPrimary }]}>
                  {lang.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {error && (
        <View style={[s.errorBox, { backgroundColor: scheme === 'dark' ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', borderColor: colors.danger }]}>
          <AlertCircle size={16} color={colors.danger} />
          <Text style={[t.caption, { color: colors.danger, flex: 1 }]}>{error}</Text>
        </View>
      )}

      <ScrollView style={s.results} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ══════════════ FIGURE RESULT (CURATED) ══════════════ */}
        {mode === 'hadith' && figureResult && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
            <View style={[s.resultHeader, { marginBottom: 8 }]}>
              <HelpCircle size={16} color={colors.accent} />
              <Text style={[t.captionMedium, { color: colors.accent, marginLeft: 8, flex: 1 }]}>
                Who is {figureResult.name}
              </Text>
            </View>
            <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22, marginBottom: 12 }]}>
              {figureResult.description}
            </Text>
            <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
            <Text style={[t.captionMedium, { color: colors.accent, marginTop: 8 }]}>Known for</Text>
            <Text style={[t.caption, { color: colors.textMuted, lineHeight: 20, marginTop: 4 }]}>{figureResult.knownFor}</Text>
            {figureResult.quranMention && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 8 }]}>Quran mention</Text>
                <Text style={[t.caption, { color: colors.textMuted, lineHeight: 20, marginTop: 4 }]}>{figureResult.quranMention}</Text>
              </>
            )}
            {figureResult.hadithRef && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 8 }]}>Hadith reference</Text>
                <Text style={[t.caption, { color: colors.textMuted, lineHeight: 20, marginTop: 4 }]}>{figureResult.hadithRef}</Text>
              </>
            )}
          </View>
        )}

        {/* ══════════════ HADITH RESULTS ══════════════ */}
        {mode === 'hadith' && keywordSearchWarning && (
          <View style={[s.warningCaveat, { backgroundColor: scheme === 'dark' ? 'rgba(250,204,21,0.08)' : 'rgba(250,204,21,0.08)', borderColor: '#ca8a04' }]}>
            <AlertCircle size={14} color="#ca8a04" />
            <Text style={[t.caption, { color: '#ca8a04', flex: 1, marginLeft: 6 }]}>
              These results contain matching keywords but may not directly answer your question. Try phrasing as a question for a more relevant answer.
            </Text>
          </View>
        )}

        {mode === 'hadith' && noResults && !loading && !answer && (
          <View style={s.empty}>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center' }]}>
              No hadith found for this topic. Try different keywords.
            </Text>
          </View>
        )}

        {mode === 'hadith' && hadithResults && hadithResults.length > 0 && (
          <>
            <Text style={[t.caption, { marginBottom: 8, paddingHorizontal: 4 }]}>
              {hadithTotalFound > hadithResults.length ? `Showing ${hadithResults.length} of ${hadithTotalFound} results` : `${hadithResults.length} result${hadithResults.length !== 1 ? 's' : ''}`}
            </Text>
            {hadithResults.map((h) => (
              <View key={h.id} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                <View style={s.hadithHeader}>
                  <Text style={[t.captionMedium, { color: colors.accent, flex: 1 }]}>
                    {h.collectionName} #{h.hadithNumber}
                  </Text>
                  <View style={[
                    s.gradeBadge,
                    {
                      backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      borderColor: h.grade?.toLowerCase().includes('sahih') ? '#16a34a' : colors.composerBorder,
                    },
                  ]}>
                    <Text style={[
                      t.caption,
                      {
                        fontSize: 11,
                        color: h.grade?.toLowerCase().includes('sahih') ? '#16a34a' : colors.textMuted,
                      },
                    ]}>{h.grade}</Text>
                  </View>
                </View>
                <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{h.english}</Text>
                {h.arabic && (
                  <Text style={[s.arabicTextSmall, { color: colors.textPrimary, marginTop: 12 }]}>{h.arabic}</Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* ══════════════ HADITH Q&A FALLBACK ══════════════ */}
        {mode === 'hadith' && answer && (
          <>
            {answer && confidenceMeta && (
              <>
                <View style={s.confidenceRow}>
                  <View style={[s.confidenceDot, { backgroundColor: scheme === 'dark' ? confidenceMeta.darkColor : confidenceMeta.color }]} />
                  <Text style={[t.captionMedium, { color: scheme === 'dark' ? confidenceMeta.darkColor : confidenceMeta.color }]}>
                    {confidenceMeta.label}
                  </Text>
                </View>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                  <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{answer}</Text>
                </View>
              </>
            )}

            {answerQuranVerses.length > 0 && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Quran Verses Referenced
                </Text>
                {answerQuranVerses.map((v, i) => (
                  <View key={v.verseKey} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                    <View style={s.resultHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                          {v.surahName} {v.verseKey}
                        </Text>
                      </View>
                      <QuranAudioPlayer surah={v.surahNumber} ayah={v.ayah} verseKey={v.verseKey} />
                    </View>
                    <Text style={[s.arabicText, { color: colors.textPrimary }]}>{v.arabic}</Text>
                    <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
                    <Text style={[t.body, { color: colors.textPrimary }]}>{v.translation}</Text>
                    <Text style={[t.caption, { marginTop: 4 }]}>{v.translationSource}</Text>
                  </View>
                ))}
              </>
            )}

            {answerHadiths.length > 0 && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Hadith Referenced
                </Text>
                {answerHadiths.map((h) => (
                  <View key={`${h.collection}-${h.hadithNumber}`} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                    <View style={s.hadithHeader}>
                      <Text style={[t.captionMedium, { color: colors.accent, flex: 1 }]}>
                        {h.collectionName} #{h.hadithNumber}
                      </Text>
                      <View style={[s.gradeBadge, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[t.caption, { color: colors.textMuted, fontSize: 11 }]}>{h.grade}</Text>
                      </View>
                    </View>
                    <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{h.english}</Text>
                    {h.arabic && (
                      <Text style={[s.arabicText, { color: colors.textPrimary, marginTop: 12 }]}>{h.arabic}</Text>
                    )}
                  </View>
                ))}
              </>
            )}

            {answerTafsir && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Scholarly Explanation
                </Text>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                  <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 2 }]}>
                    Tafsir {answerTafsir.source}
                  </Text>
                  <Text style={[t.caption, { color: colors.textMuted, marginBottom: 10 }]}>
                    {answerTafsir.author}
                  </Text>
                  <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>
                    {answerTafsir.text}
                  </Text>
                </View>
              </>
            )}
          </>
        )}

        {/* ══════════════ QURAN MODE ══════════════ */}

        {/* ── Ayah result ── */}
        {mode === 'quran' && ayahResult && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
            <View style={s.resultHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                  {ayahResult.surah?.name_english} ({ayahResult.surah?.name_translation})
                </Text>
                <Text style={[t.caption, { marginBottom: 4 }]}>{ayahResult.verseKey}</Text>
              </View>
              {ayahResult.verseKey && (() => {
                const parts = ayahResult.verseKey.split(':');
                const sNum = parseInt(parts[0]);
                const aNum = parseInt(parts[1]);
                if (sNum && aNum) {
                  return <QuranAudioPlayer surah={sNum} ayah={aNum} verseKey={ayahResult.verseKey} />;
                }
                return null;
              })()}
            </View>
            <Text style={[s.arabicText, { color: colors.textPrimary }]}>{ayahResult.arabic}</Text>
            {ayahResult.transliteration && (
              <Text style={[t.caption, { fontStyle: 'italic', marginTop: 12 }]}>{ayahResult.transliteration}</Text>
            )}
            <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
            <Text style={[t.body, { color: colors.textPrimary }]}>{ayahResult.translation}</Text>

            {/* Tafsir toggle */}
            <Pressable
              style={[s.tafsirToggle, { borderColor: colors.composerBorder }]}
              onPress={() => {
                setTafsirExpanded(!tafsirExpanded);
                if (!tafsirExpanded && !tafsir && !tafsirError) {
                  const parts = ayahResult.verseKey.split(':');
                  fetchTafsirForVerse(parseInt(parts[0]), parseInt(parts[1]), tafsirSource);
                }
              }}
            >
              <BookOpen size={14} color={colors.accent} />
              <Text style={[t.captionMedium, { color: colors.accent }]}>
                {tafsirExpanded ? 'Hide Tafsir' : 'View Tafsir'}
              </Text>
            </Pressable>

            {tafsirExpanded && (
              <View style={{ marginTop: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {TAFSIR_SOURCES.map((src) => (
                    <Pressable
                      key={src.key}
                      style={[
                        s.tafsirSourceBtn,
                        {
                          backgroundColor: tafsirSource === src.key
                            ? (scheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)')
                            : 'transparent',
                          borderColor: tafsirSource === src.key ? colors.accent : colors.composerBorder,
                        },
                      ]}
                      onPress={() => {
                        setTafsirSource(src.key);
                        const parts = ayahResult.verseKey.split(':');
                        fetchTafsirForVerse(parseInt(parts[0]), parseInt(parts[1]), src.key);
                      }}
                    >
                      <Text style={[t.caption, { color: tafsirSource === src.key ? colors.accent : colors.textMuted }]}>
                        {src.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {tafsirLoading && <ActivityIndicator size="small" color={colors.accent} />}

                {tafsirError && (
                  <Text style={[t.caption, { color: colors.danger }]}>{tafsirError}</Text>
                )}

                {tafsir && (
                  <>
                    <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                      {tafsir.name} says:
                    </Text>
                    <Text style={[t.caption, { color: colors.textMuted, marginBottom: 8 }]}>
                      {tafsir.author}
                    </Text>
                    <ScrollView style={{ maxHeight: 300 }}>
                      <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>
                        {tafsir.text}
                      </Text>
                    </ScrollView>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Search results ── */}
        {mode === 'quran' && searchResults && searchResults.length === 0 && (
          <View style={s.empty}>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center' }]}>No results found.</Text>
          </View>
        )}

        {mode === 'quran' && searchResults && searchResults.length > 0 && (
          <>
            <Text style={[t.caption, { marginBottom: 8, paddingHorizontal: 4 }]}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </Text>
            {searchResults.map((r, i) => (
              <View key={r.verseKey} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                <View style={s.resultHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                      {r.surahName} {r.verseKey}
                    </Text>
                  </View>
                  <QuranAudioPlayer surah={r.surahNumber} ayah={r.ayah} verseKey={r.verseKey} />
                </View>
                <Text style={[s.arabicText, { color: colors.textPrimary }]}>{r.arabic}</Text>
                {r.translation && (
                  <>
                    <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
                    <Text style={[t.body, { color: colors.textPrimary }]}>{r.translation}</Text>
                    <Text style={[t.caption, { marginTop: 4 }]}>{r.translationSource}</Text>
                  </>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── Question / Answer mode ── */}
        {mode === 'quran' && noResults && (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
            <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', lineHeight: 22 }]}>
              No directly relevant Quranic verses or hadith were found for your question. Try rephrasing with different keywords.
            </Text>
          </View>
        )}

        {mode === 'quran' && (answerQuranVerses.length > 0 || answerHadiths.length > 0) ? (
          <>
            {answer && confidenceMeta && (
              <>
                <View style={s.confidenceRow}>
                  <View style={[s.confidenceDot, { backgroundColor: scheme === 'dark' ? confidenceMeta.darkColor : confidenceMeta.color }]} />
                  <Text style={[t.captionMedium, { color: scheme === 'dark' ? confidenceMeta.darkColor : confidenceMeta.color }]}>
                    {confidenceMeta.label}
                  </Text>
                </View>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                  <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{answer}</Text>
                </View>
              </>
            )}

            {answerQuranVerses.length > 0 && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Quran Verses Referenced
                </Text>
                {answerQuranVerses.map((v, i) => (
                  <View key={v.verseKey} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                    <View style={s.resultHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 4 }]}>
                          {v.surahName} {v.verseKey}
                        </Text>
                      </View>
                      <QuranAudioPlayer surah={v.surahNumber} ayah={v.ayah} verseKey={v.verseKey} />
                    </View>
                    <Text style={[s.arabicText, { color: colors.textPrimary }]}>{v.arabic}</Text>
                    <View style={[s.divider, { backgroundColor: colors.composerBorder }]} />
                    <Text style={[t.body, { color: colors.textPrimary }]}>{v.translation}</Text>
                    <Text style={[t.caption, { marginTop: 4 }]}>{v.translationSource}</Text>
                  </View>
                ))}
              </>
            )}

            {answerHadiths.length > 0 && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Hadith Referenced
                </Text>
                {answerHadiths.map((h) => (
                  <View key={`${h.collection}-${h.hadithNumber}`} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                    <View style={s.hadithHeader}>
                      <Text style={[t.captionMedium, { color: colors.accent, flex: 1 }]}>
                        {h.collectionName} #{h.hadithNumber}
                      </Text>
                      <View style={[s.gradeBadge, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[t.caption, { color: colors.textMuted, fontSize: 11 }]}>{h.grade}</Text>
                      </View>
                    </View>
                    <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>{h.english}</Text>
                    {h.arabic && (
                      <Text style={[s.arabicText, { color: colors.textPrimary, marginTop: 12 }]}>{h.arabic}</Text>
                    )}
                  </View>
                ))}
              </>
            )}

            {answerTafsir && (
              <>
                <Text style={[t.captionMedium, { color: colors.accent, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }]}>
                  Scholarly Explanation
                </Text>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, softShadow()]}>
                  <Text style={[t.captionMedium, { color: colors.accent, marginBottom: 2 }]}>
                    Tafsir {answerTafsir.source}
                  </Text>
                  <Text style={[t.caption, { color: colors.textMuted, marginBottom: 10 }]}>
                    {answerTafsir.author}
                  </Text>
                  <Text style={[t.body, { color: colors.textPrimary, lineHeight: 22 }]}>
                    {answerTafsir.text}
                  </Text>
                </View>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  modeRow: {
    flexDirection: 'row', gap: 4,
    borderRadius: radii.sm, borderWidth: 1, padding: 3, marginBottom: 8,
  },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: radii.sm - 2,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
  },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16 },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  langButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: radii.sm, borderWidth: 1,
  },
  submitBtn: {
    paddingVertical: 8, paddingHorizontal: 24, borderRadius: radii.sm,
    alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 36,
  },
  langPicker: {
    marginTop: 4, borderRadius: radii.sm, borderWidth: 1, overflow: 'hidden',
  },
  langOption: {
    paddingVertical: 10, paddingHorizontal: 14,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: radii.sm, borderWidth: 1, marginTop: 8,
  },
  results: { flex: 1, marginTop: 12 },
  card: {
    borderRadius: radii.md, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  resultHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 8,
  },
  arabicText: {
    fontFamily: 'Inter_400Regular', fontSize: 22, lineHeight: 40,
    textAlign: 'right', writingDirection: 'rtl',
  },
  arabicTextSmall: {
    fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 32,
    textAlign: 'right', writingDirection: 'rtl',
  },
  divider: { height: 1, marginVertical: 12 },
  empty: { paddingVertical: 40, alignItems: 'center' },
  warningCaveat: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radii.sm, borderWidth: 1,
    marginBottom: 12,
  },
  confidenceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, paddingHorizontal: 4,
  },
  confidenceDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  hadithHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  gradeBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  tafsirToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radii.sm, borderWidth: 1, alignSelf: 'flex-start',
  },
  tafsirSourceBtn: {
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: radii.sm, borderWidth: 1, marginRight: 6,
  },
});
