import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;
const ummahApiKey = Deno.env.get('UMMAH_API_KEY')!;

const UMMAH_BASE = 'https://ummahapi.com';
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_TIMEOUT = 60_000;
const MAX_CONTEXT_CHARS = 6_000;
const SEMANTIC_MIN_SIMILARITY = 0.5;

// Comprehensive surah name map: all common names + alternate spellings → surah number
const SURAH_NAMES: Record<string, number> = {
  'fatiha': 1, 'fatihah': 1, 'al-fatiha': 1, 'al-fatihah': 1, 'al fatiha': 1, 'al fatihah': 1, 'fathia': 1, 'fatihat': 1,
  'baqarah': 2, 'baqara': 2, 'al-baqarah': 2, 'al-baqara': 2, 'al baqarah': 2, 'bakara': 2, 'baqarat': 2,
  'imran': 3, 'aal-e-imran': 3, 'aleimran': 3, 'al-imran': 3, 'al imran': 3, 'aale-imran': 3, 'ali-imran': 3, 'aaleimran': 3, 'aal e imran': 3,
  'nisa': 4, 'nisaa': 4, 'an-nisa': 4, 'an nisa': 4, 'al-nisa': 4, 'annisa': 4, 'nisah': 4, 'nisaa\'': 4,
  'maidah': 5, 'maida': 5, 'al-maidah': 5, 'al maidah': 5, 'almai\'dah': 5, 'mai\'dah': 5, 'almaidah': 5,
  'anam': 6, 'an\'am': 6, 'al-anam': 6, 'al an\'am': 6, 'alanam': 6, 'an\'aam': 6, 'al-an\'am': 6,
  'araf': 7, 'a\'raf': 7, 'al-a\'raf': 7, 'al a\'raf': 7, 'al-araf': 7,
  'anfal': 8, 'al-anfal': 8, 'al anfal': 8,
  'tawbah': 9, 'taubah': 9, 'at-tawbah': 9, 'at tawbah': 9, 'al-tawbah': 9, 'tawba': 9,
  'yunus': 10, 'younus': 10,
  'hud': 11,
  'yusuf': 12, 'yousef': 12, 'yousuf': 12, 'yusif': 12,
  'rad': 13, 'ra\'d': 13, 'ar-rad': 13, 'ar-ra\'d': 13, 'ar rad': 13, 'raad': 13, 'al-rad': 13,
  'ibrahim': 14, 'ibraheem': 14, 'abraheem': 14,
  'hijr': 15, 'al-hijr': 15, 'al hijr': 15,
  'nahl': 16, 'an-nahl': 16, 'an nahl': 16, 'al-nahl': 16, 'nahal': 16,
  'isra': 17, 'al-isra': 17, 'al isra': 17, 'israa': 17, 'bani israil': 17, 'bani israel': 17, 'al-israa': 17,
  'kahf': 18, 'al-kahf': 18, 'al kahf': 18, 'kahaf': 18, 'as-hab al-kahf': 18, 'cave': 18,
  'maryam': 19, 'mariam': 19, 'maryaam': 19, 'mariyam': 19,
  'taha': 20, 'ta-ha': 20, 'ta ha': 20,
  'anbiya': 21, 'al-anbiya': 21, 'al anbiya': 21, 'anbiyaa': 21,
  'hajj': 22, 'al-hajj': 22, 'al hajj': 22, 'haj': 22,
  'muminun': 23, 'al-muminun': 23, 'al muminun': 23, 'mu\'minun': 23, 'mumineen': 23, 'muminoon': 23,
  'nur': 24, 'noor': 24, 'an-nur': 24, 'an nur': 24, 'al-nur': 24,
  'furqan': 25, 'al-furqan': 25, 'al furqan': 25,
  'shuara': 26, 'ash-shu\'ara': 26, 'ash shuara': 26, 'shu\'ara': 26, 'shuaraa': 26,
  'naml': 27, 'an-naml': 27, 'an naml': 27, 'al-naml': 27,
  'qasas': 28, 'al-qasas': 28, 'al qasas': 28,
  'ankabut': 29, 'al-ankabut': 29, 'al ankabut': 29, 'ankaboot': 29,
  'rum': 30, 'ar-rum': 30, 'ar rum': 30, 'al-rum': 30,
  'luqman': 31, 'luqmaan': 31, 'lokman': 31, 'loqman': 31,
  'sajdah': 32, 'as-sajdah': 32, 'as sajdah': 32, 'al-sajdah': 32, 'sajda': 32,
  'ahzab': 33, 'al-ahzab': 33, 'al ahzab': 33,
  'saba': 34, 'sheba': 34, 'sabaa': 34,
  'fatir': 35, 'al-fatir': 35, 'al fatir': 35, 'fater': 35,
  'yasin': 36, 'yaseen': 36, 'ya-sin': 36, 'ya sin': 36, 'yaaseen': 36, 'yaseen': 36,
  'saffat': 37, 'as-saffat': 37, 'as saffat': 37, 'al-saffat': 37,
  'sad': 38, 'saad': 38, 'swad': 38,
  'zumar': 39, 'az-zumar': 39, 'az zumar': 39, 'al-zumar': 39,
  'ghafir': 40, 'al-ghafir': 40, 'al ghafir': 40, 'ghaafir': 40,
  'fussilat': 41, 'fusilat': 41, 'fussilat': 41, 'ha meem sajdah': 41,
  'shura': 42, 'ash-shura': 42, 'ash shura': 42, 'al-shura': 42,
  'zukhruf': 43, 'az-zukhruf': 43, 'az zukhruf': 43, 'al-zukhruf': 43,
  'dukhan': 44, 'ad-dukhan': 44, 'ad dukhan': 44, 'al-dukhan': 44,
  'jathiya': 45, 'al-jathiya': 45, 'al jathiya': 45, 'jathiah': 45,
  'ahqaf': 46, 'al-ahqaf': 46, 'al ahqaf': 46,
  'muhammad': 47, 'mohammad': 47, 'mohammed': 47,
  'fath': 48, 'al-fath': 48, 'al fath': 48,
  'hujurat': 49, 'al-hujurat': 49, 'al hujurat': 49, 'hujuraat': 49,
  'qaf': 50,
  'dhariyat': 51, 'adh-dhariyat': 51, 'adh dhariyat': 51, 'al-dhariyat': 51,
  'tur': 52, 'at-tur': 52, 'at tur': 52, 'al-tur': 52, 'toor': 52,
  'najm': 53, 'an-najm': 53, 'an najm': 53, 'al-najm': 53,
  'qamar': 54, 'al-qamar': 54, 'al qamar': 54,
  'rahman': 55, 'rehman': 55, 'rahmaan': 55, 'ar-rahman': 55, 'ar rahman': 55, 'al-rahman': 55, 'al rahman': 55,
  'waqiah': 56, 'waqi\'ah': 56, 'al-waqiah': 56, 'al waqiah': 56, 'waqia': 56, 'al-waqia': 56, 'waqi\'a': 56,
  'hadid': 57, 'al-hadid': 57, 'al hadid': 57, 'hadeed': 57,
  'mujadila': 58, 'al-mujadila': 58, 'al mujadila': 58, 'mujadalah': 58, 'mujadilah': 58,
  'hashr': 59, 'al-hashr': 59, 'al hashr': 59, 'hasyr': 59,
  'mumtahanah': 60, 'al-mumtahanah': 60, 'al mumtahanah': 60, 'mumtahina': 60, 'mumtahan': 60,
  'saff': 61, 'as-saff': 61, 'as saff': 61, 'al-saff': 61,
  'jumuah': 62, 'jumu\'ah': 62, 'al-jumuah': 62, 'al jumuah': 62, 'jumu\'a': 62, 'jumua': 62, 'juma': 62, 'jummah': 62,
  'munafiqun': 63, 'al-munafiqun': 63, 'al munafiqun': 63, 'munafiqoon': 63, 'munafiqin': 63,
  'taghabun': 64, 'at-taghabun': 64, 'at taghabun': 64, 'al-taghabun': 64,
  'talaq': 65, 'at-talaq': 65, 'at talaq': 65, 'al-talaq': 65, 'talaaq': 65,
  'tahrim': 66, 'at-tahrim': 66, 'at tahrim': 66, 'al-tahrim': 66, 'tahreem': 66,
  'mulk': 67, 'al-mulk': 67, 'al mulk': 67, 'tabarak': 67, 'tabarak allah': 67,
  'qalam': 68, 'al-qalam': 68, 'al qalam': 68, 'nun': 68,
  'haqqah': 69, 'al-haqqah': 69, 'al haqqah': 69, 'haqqa': 69,
  'maarij': 70, 'al-maarij': 70, 'al maarij': 70, 'ma\'arij': 70,
  'nuh': 71, 'nooh': 71, 'noah': 71,
  'jinn': 72, 'al-jinn': 72, 'al jinn': 72,
  'muzzammil': 73, 'al-muzzammil': 73, 'al muzzammil': 73,
  'muddaththir': 74, 'al-muddaththir': 74, 'al muddaththir': 74, 'mudassir': 74,
  'qiyamah': 75, 'al-qiyamah': 75, 'al qiyamah': 75, 'qiyama': 75,
  'insan': 76, 'al-insan': 76, 'al insan': 76, 'ad-dahr': 76, 'dahr': 76, 'addahr': 76,
  'mursalat': 77, 'al-mursalat': 77, 'al mursalat': 77, 'mursalaat': 77,
  'naba': 78, 'an-naba': 78, 'an naba': 78, 'al-naba': 78, 'nabah': 78, 'annaba': 78,
  'naziat': 79, 'an-naziat': 79, 'an naziat': 79, 'al-naziat': 79, 'nazi\'at': 79,
  'abasa': 80, '\'abasa': 80, 'abasa': 80,
  'takwir': 81, 'at-takwir': 81, 'at takwir': 81, 'al-takwir': 81,
  'infitar': 82, 'al-infitar': 82, 'al infitar': 82,
  'mutaffifin': 83, 'al-mutaffifin': 83, 'al mutaffifin': 83, 'mutafeefeen': 83,
  'inshiqaq': 84, 'al-inshiqaq': 84, 'al inshiqaq': 84,
  'buruj': 85, 'al-buruj': 85, 'al buruj': 85, 'burooj': 85,
  'tariq': 86, 'at-tariq': 86, 'at tariq': 86, 'al-tariq': 86, 'tareq': 86,
  'ala': 87, 'a\'la': 87, 'al-a\'la': 87, 'al a\'la': 87, 'al-ala': 87,
  'ghashiyah': 88, 'al-ghashiyah': 88, 'al ghashiyah': 88, 'ghaashiyah': 88,
  'fajr': 89, 'al-fajr': 89, 'al fajr': 89,
  'balad': 90, 'al-balad': 90, 'al balad': 90,
  'shams': 91, 'ash-shams': 91, 'ash shams': 91,
  'layl': 92, 'al-layl': 92, 'al layl': 92, 'lail': 92, 'laylah': 92,
  'duha': 93, 'ad-duha': 93, 'ad duha': 93, 'al-duha': 93, 'dhuha': 93,
  'sharh': 94, 'ash-sharh': 94, 'ash sharh': 94, 'inshirah': 94, 'alam nashrah': 94, 'inshira': 94,
  'tin': 95, 'at-tin': 95, 'at tin': 95, 'al-tin': 95,
  'alaq': 96, 'al-alaq': 96, 'al alaq': 96, 'iqra': 96, 'iqraa': 96, 'igra': 96, 'al-alaq': 96,
  'qadr': 97, 'al-qadr': 97, 'al qadr': 97,
  'bayyinah': 98, 'al-bayyinah': 98, 'al bayyinah': 98, 'bayinna': 98,
  'zalzalah': 99, 'az-zalzalah': 99, 'az zalzalah': 99, 'al-zalzalah': 99,
  'adiyat': 100, 'al-adiyat': 100, 'al adiyat': 100,
  'qariah': 101, 'al-qariah': 101, 'al qariah': 101, 'qaari\'ah': 101, 'qari\'ah': 101,
  'takathur': 102, 'at-takathur': 102, 'at takathur': 102, 'al-takathur': 102, 'takaathur': 102,
  'asr': 103, 'al-asr': 103, 'al asr': 103, 'al-\'asr': 103,
  'humazah': 104, 'al-humazah': 104, 'al humazah': 104, 'humaza': 104, 'humazah': 104,
  'fil': 105, 'al-fil': 105, 'al fil': 105, 'feel': 105,
  'quraysh': 106, 'quraish': 106, 'qurash': 106,
  'maun': 107, 'al-ma\'un': 107, 'al maun': 107, 'ma\'un': 107, 'maoon': 107, 'al-maun': 107,
  'kawthar': 108, 'al-kawthar': 108, 'al kawthar': 108, 'kauthar': 108, 'kausar': 108, 'kawsar': 108, 'kousar': 108,
  'kafirun': 109, 'al-kafirun': 109, 'al kafirun': 109, 'kafiroon': 109, 'al-kafiroon': 109,
  'nasr': 110, 'an-nasr': 110, 'an nasr': 110, 'al-nasr': 110,
  'masad': 111, 'al-masad': 111, 'al masad': 111, 'lahab': 111, 'al-lahab': 111, 'al lahab': 111, 'abu lahab': 111,
  'ikhlas': 112, 'ikhlaas': 112, 'al-ikhlas': 112, 'al ikhlas': 112, 'ikhlass': 112, 'ekhlas': 112, 'tawhid': 112, 'tawheed': 112, 'al-ikhlaas': 112,
  'falaq': 113, 'al-falaq': 113, 'al falaq': 113,
  'nas': 114, 'an-nas': 114, 'an nas': 114, 'al-nas': 114, 'annaas': 114,
};

// Suurah name detection: returns surah number if user asks about a named surah
function detectSurahQuery(question: string): number | null {
  const lower = question.toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  // Pattern 1: "surah <name>" or "sura <name>"
  const surahPattern = /(?:^|\s)(surah|sura)\s+([a-z-]+)/;
  const match = lower.match(surahPattern);
  if (match) {
    const name = match[2];
    if (SURAH_NAMES[name]) return SURAH_NAMES[name];
  }
  // Pattern 2: "surah <number>" or "surah number <number>"
  const numberPattern = /(?:^|\s)(surah|sura)\s+(?:number\s+)?(\d{1,3})\b/;
  const numberMatch = lower.match(numberPattern);
  if (numberMatch) {
    const num = parseInt(numberMatch[2], 10);
    if (num >= 1 && num <= 114) return num;
  }
  // Pattern 3: standalone surah name (> 4 chars to avoid false positives with common words)
  const words = lower.split(/\s+/);
  for (const word of words) {
    if (word.length > 4 && SURAH_NAMES[word]) return SURAH_NAMES[word];
  }
  return null;
}

// Fetch a complete surah from UmmahAPI
async function fetchSurahDirect(
  surahNumber: number,
  translation: string,
  headers: Record<string, string>,
): Promise<{ verseKey: string; surahNumber: number; surahName: string; ayah: number; arabic: string; translation: string; translationSource: string }[]> {
  try {
    const res = await fetch(`${UMMAH_BASE}/api/quran/surah/${surahNumber}?translation=${translation}`, { headers });
    const data = await res.json();
    if (!data.success) return [];
    const surahMeta = data.data?.surah;
    const surahName = surahMeta?.name_english || `Surah ${surahNumber}`;
    const verses = data.data?.verses || [];
    return verses.map((v: Record<string, unknown>) => ({
      verseKey: v.verse_key as string,
      surahNumber: surahNumber,
      surahName,
      ayah: v.ayah as number,
      arabic: v.arabic as string,
      translation: v.translation as string,
      translationSource: translation,
    }));
  } catch (err) {
    console.log(`[Quran-Answer] fetchSurahDirect error for surah ${surahNumber}:`, String(err));
    return [];
  }
}

// Map common English Islamic terms to Arabic/transliterated variants
// UmmahAPI indexes Arabic text + English translation — some topics
// are better found via their Arabic term.
const ARABIC_FALLBACKS: Record<string, string[]> = {
  fasting: ['sawm', 'siyam'],
  prayer: ['salat', 'salah'],
  charity: ['zakat', 'sadaqah'],
  pilgrimage: ['hajj', 'umrah'],
  god: ['allah'],
  lord: ['rabb'],
  mercy: ['rahmah'],
  prophet: ['nabi', 'rasul'],
  angels: ['malaikah'],
  heaven: ['jannah', 'paradise'],
  hell: ['jahannam', 'hellfire'],
  repentance: ['tawbah'],
  patience: ['sabr'],
  gratitude: ['shukr'],
  knowledge: ['ilm'],
  justice: ['adl'],
  truth: ['haqq'],
  faith: ['iman'],
  worship: ['ibadah'],
  marriage: ['nikah'],
  divorce: ['talaq'],
  oath: ['yamin'],
  witnesses: ['shahada'],
  inheritance: ['mirath'],
  usury: ['riba'],
  gambling: ['maysir'],
  intoxicants: ['khamr'],
  pork: ['khinzir'],
  fasting: ['sawm', 'siyam'],
  friday: ['jumuah'],
  mosque: ['masjid'],
  hypocrite: ['munafiq'],
  disbeliever: ['kafir'],
  believer: ['mumin', 'muminun'],
  Satan: ['shaytan', 'iblis'],
};

async function callNvidia(messages: unknown[]): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), NVIDIA_TIMEOUT);
  try {
    const res = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${nvidiaApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nvidia/nemotron-mini-4b-instruct', messages, stream: false }),
      signal: abort.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.log(`[NVIDIA] error: status=${res.status}, body=${errText.slice(0, 500)}`);
      return { ok: false, error: `NVIDIA returned ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log(`[NVIDIA] empty response:`, JSON.stringify(data).slice(0, 300));
      return { ok: false, error: 'NVIDIA returned empty response' };
    }
    return { ok: true, content };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.log(`[NVIDIA] timeout after ${NVIDIA_TIMEOUT}ms`);
      return { ok: false, error: `NVIDIA model timed out after ${NVIDIA_TIMEOUT / 1000}s` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[NVIDIA] fetch error: ${msg}`);
    return { ok: false, error: `Failed to call NVIDIA: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

function extractKeywords(question: string): string[] {
  const stopwords = new Set([
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
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}

// Fetch Quran search results for a single query term, return normalized objects
async function searchQuran(
  term: string,
  translation: string,
  headers: Record<string, string>,
): Promise<{ verseKey: string; surahNumber: number; surahName: string; ayah: number; arabic: string; translation: string; translationSource: string }[]> {
  try {
    const params = new URLSearchParams({ q: term, translation, limit: '5' });
    const res = await fetch(`${UMMAH_BASE}/api/quran/search?${params}`, { headers });
    const data = await res.json();
    if (!data.success) return [];
    return (data.data?.results || []).map((r: Record<string, unknown>) => ({
      verseKey: r.verse_key as string,
      surahNumber: r.surah_number as number,
      surahName: r.surah_name as string,
      ayah: r.ayah as number,
      arabic: r.arabic as string,
      translation: r.translation as string,
      translationSource: r.translation_source as string,
    }));
  } catch (err) {
    console.log(`[Quran-Answer] searchQuran error for term="${term}":`, String(err));
    return [];
  }
}

// Fetch Hadith search results for a single query term
async function searchHadith(
  term: string,
  headers: Record<string, string>,
): Promise<{ id: string; collection: string; collectionName: string; hadithNumber: number; arabic?: string; english: string; grade: string }[]> {
  try {
    const params = new URLSearchParams({ q: term, limit: '3' });
    const res = await fetch(`${UMMAH_BASE}/api/hadith/search?${params}`, { headers });
    const data = await res.json();
    if (!data.success) return [];
    return (data.data?.hadiths || []).map((h: Record<string, unknown>) => ({
      id: h.id as string,
      collection: h.collection as string,
      collectionName: h.collection_name as string,
      hadithNumber: h.hadithnumber as number,
      arabic: h.arabic as string | undefined,
      english: h.english as string,
      grade: h.grade as string,
    }));
  } catch (err) {
    console.log(`[Quran-Answer] searchHadith error for term="${term}":`, String(err));
    return [];
  }
}

// Semantic search fallback — calls the quran-semantic-search edge function
async function semanticSearch(
  question: string,
  matchCount: number,
  authToken: string,
): Promise<{ surah: number; ayah: number; translation_text: string; similarity: number }[]> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/quran-semantic-search`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: question, match_count: matchCount }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.log(`[Quran-Answer] semantic search HTTP ${res.status}: ${err.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    return data.verses || [];
  } catch (err) {
    console.log(`[Quran-Answer] semantic search error:`, String(err));
    return [];
  }
}

async function fetchTafsir(
  surah: number,
  ayah: number,
): Promise<{ key: string; name: string; author: string; text: string } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) headers['x-api-key'] = ummahApiKey;
    const res = await fetch(`${UMMAH_BASE}/api/tafsir/ibn_kathir/surah/${surah}/ayah/${ayah}`, { headers });
    const data = await res.json();
    if (!data.success || !data.data?.tafsir?.text) {
      console.log(`[Quran-Answer] tafsir not available for ${surah}:${ayah}`);
      return null;
    }
    return data.data.tafsir;
  } catch (err) {
    console.log(`[Quran-Answer] tafsir fetch error:`, String(err));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { question, translation } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: 'Missing question' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[Quran-Answer] question="${question}" user=${user.id}`);

    const keywords = extractKeywords(question);
    console.log(`[Quran-Answer] extracted keywords="${keywords.join(', ')}"`);

    // Check if user is asking about a specific surah by name
    const surahNumber = detectSurahQuery(question);
    if (surahNumber) {
      console.log(`[Quran-Answer] detected named surah: ${surahNumber} — routing to direct surah lookup`);
    }

    const apiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) apiHeaders['x-api-key'] = ummahApiKey;

    const tr = translation || 'sahih_international';

    // Start semantic search in parallel (but we'll filter by similarity threshold)
    const semanticPromise = semanticSearch(question, 8, token);

    // If we need keyword search, build search terms
    let searchTerms = new Set<string>();
    if (keywords.length > 0) {
      searchTerms = new Set([...keywords]);
      for (const kw of keywords) {
        const fallbacks = ARABIC_FALLBACKS[kw];
        if (fallbacks) {
          for (const fb of fallbacks) searchTerms.add(fb);
        }
      }
    }

    // Fire all searches in parallel
    const promises: Promise<unknown>[] = [];

    // Direct surah fetch
    const surahPromise = surahNumber ? fetchSurahDirect(surahNumber, tr, apiHeaders) : Promise.resolve([] as Awaited<ReturnType<typeof fetchSurahDirect>>);

    // Keyword searches
    const termArray = [...searchTerms];
    const quranPromises = termArray.map((t) => searchQuran(t, tr, apiHeaders));
    const hadithPromises = termArray.map((t) => searchHadith(t, apiHeaders));

    const [quranResults, hadithResults, directSurahVerses, semanticVerses] = await Promise.all([
      Promise.all(quranPromises),
      Promise.all(hadithPromises),
      surahPromise,
      semanticPromise,
    ]);

    // Process direct surah verses (highest priority)
    const directSurahSet = new Set<string>();
    const quranVerses: Array<typeof quranResults[0][0]> = [];
    for (const dv of directSurahVerses) {
      if (!directSurahSet.has(dv.verseKey)) {
        directSurahSet.add(dv.verseKey);
        quranVerses.push({ ...dv, translationSource: `${tr} (direct surah)` });
      }
    }

    // Merge keyword results (skip verse keys already added by direct surah)
    const seenQuran = new Set<string>([...directSurahSet]);
    for (const batch of quranResults) {
      for (const v of batch) {
        if (!seenQuran.has(v.verseKey)) {
          seenQuran.add(v.verseKey);
          quranVerses.push(v);
        }
      }
    }

    // Merge deduped Hadith results (keep up to 5)
    const seenHadith = new Set<string>();
    const hadiths = hadithResults.flat().filter((h) => {
      const key = `${h.collection}-${h.hadithNumber}`;
      if (seenHadith.has(key)) return false;
      seenHadith.add(key);
      return true;
    }).slice(0, 5);

    console.log(`[Quran-Answer] direct surah: ${directSurahVerses.length} verses, keyword: ${quranResults.flat().length - directSurahVerses.length} verses (${directSurahVerses.length} deduped), hadiths: ${hadiths.length}`);

    // Merge semantic search results — BUT filter by minimum similarity threshold
    if (semanticVerses.length > 0) {
      const aboveThreshold = semanticVerses.filter(sv => sv.similarity >= SEMANTIC_MIN_SIMILARITY);
      console.log(`[Quran-Answer] semantic search returned ${semanticVerses.length} verses, ${aboveThreshold.length} above similarity threshold ${SEMANTIC_MIN_SIMILARITY}`);
      if (aboveThreshold.length > 0) {
        for (const sv of aboveThreshold) {
          const key = `${sv.surah}:${sv.ayah}`;
          if (!seenQuran.has(key)) {
            seenQuran.add(key);
            quranVerses.push({
              verseKey: key,
              surahNumber: sv.surah,
              surahName: `Surah ${sv.surah}`,
              ayah: sv.ayah,
              arabic: '',
              translation: sv.translation_text,
              translationSource: `${tr} (semantic, sim=${sv.similarity.toFixed(3)})`,
            });
          }
        }
      }
    } else {
      console.log(`[Quran-Answer] semantic search returned no results`);
    }

    // Sort: direct surah first, then semantic, then keyword matches
    quranVerses.sort((a, b) => {
      const aDirect = a.translationSource.includes('(direct surah)') ? 0 : 1;
      const bDirect = b.translationSource.includes('(direct surah)') ? 0 : 1;
      if (aDirect !== bDirect) return aDirect - bDirect;
      const aSem = a.translationSource.includes('(semantic)') ? -1 : 1;
      const bSem = b.translationSource.includes('(semantic)') ? -1 : 1;
      return aSem - bSem;
    });
    const quranVersesFinal = quranVerses.slice(0, 8);

    // Log retrieved context for audit
    console.log(`[Quran-Answer] === RETRIEVED CONTEXT (${quranVersesFinal.length} verses, ${hadiths.length} hadiths) ===`);
    for (const v of quranVersesFinal) {
      console.log(`[Quran-Answer] [VERSE] ${v.verseKey} ${v.surahName} [${v.translationSource}]: ${v.translation.slice(0, 120)}`);
    }
    for (const h of hadiths) {
      console.log(`[Quran-Answer] [HADITH] ${h.collectionName} #${h.hadithNumber} (${h.grade}): ${h.english.slice(0, 120)}`);
    }

    // Fetch tafsir for the most relevant verse (first in sorted list)
    let tafsir: { key: string; name: string; author: string; text: string } | null = null;
    if (quranVersesFinal.length > 0) {
      const [surahNum, ayahNum] = quranVersesFinal[0].verseKey.split(':').map(Number);
      if (surahNum && ayahNum) {
        tafsir = await fetchTafsir(surahNum, ayahNum);
        console.log(`[Quran-Answer] tafsir ${tafsir ? 'found' : 'not found'} for ${quranVersesFinal[0].verseKey}`);
      }
    }

    // No-fabrication safeguard
    if (quranVersesFinal.length === 0 && hadiths.length === 0 && !surahNumber) {
      console.log(`[Quran-Answer] no results found across any search term, skipping LLM`);
      return new Response(JSON.stringify({
        answer: null,
        error: null,
        noResults: true,
        quranVerses: [],
        hadiths: [],
        tafsir: null,
        confidence: 'red',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Even if only direct surah verses exist, we still proceed to LLM
    if (quranVersesFinal.length === 0 && hadiths.length === 0 && surahNumber) {
      console.log(`[Quran-Answer] only direct surah data available, but proceeding with surah info`);
    }

    // Build context for LLM — truncate if too long to avoid context window issues
    let contextParts: string[] = [];
    let totalChars = 0;

    if (quranVersesFinal.length > 0) {
      contextParts.push('=== QURAN VERSES (RETRIEVED) ===');
      totalChars += 40;
      for (let i = 0; i < quranVersesFinal.length; i++) {
        const v = quranVersesFinal[i];
        const entry = `[Q${i + 1}] ${v.verseKey} (${v.surahName})\nTranslation: ${v.translation}`;
        if (totalChars + entry.length > MAX_CONTEXT_CHARS) break;
        contextParts.push(entry);
        totalChars += entry.length;
      }
    }

    // Add tafsir to context if available
    if (tafsir) {
      const tafsirEntry = `\n=== SCHOLARLY EXPLANATION ===\nSource: ${tafsir.name} by ${tafsir.author}\n${tafsir.text.slice(0, 1500)}`;
      if (totalChars + tafsirEntry.length <= MAX_CONTEXT_CHARS) {
        contextParts.push(tafsirEntry);
        totalChars += tafsirEntry.length;
      } else {
        contextParts.push(`\n=== SCHOLARLY EXPLANATION ===\nSource: ${tafsir.name} by ${tafsir.author}\n[tafsir excerpt too long, omitted]`);
      }
    }

    if (hadiths.length > 0) {
      contextParts.push('');
      contextParts.push('=== AUTHENTIC HADITHS (RETRIEVED) ===');
      totalChars += 45;
      for (let i = 0; i < hadiths.length; i++) {
        const h = hadiths[i];
        const entry = `[H${i + 1}] ${h.collectionName} #${h.hadithNumber} (Grade: ${h.grade})\nText: ${h.english}`;
        if (totalChars + entry.length > MAX_CONTEXT_CHARS) break;
        contextParts.push(entry);
        totalChars += entry.length;
      }
    }

    const contextStr = contextParts.join('\n');
    console.log(`[Quran-Answer] context length: ${contextStr.length} chars`);

    const systemPrompt = `You are a knowledgeable Islamic studies assistant. Your role is to answer questions about Islam using ONLY the retrieved Quran verses and authentic hadiths provided below as context.

CRITICAL RULES:
1. Answer using ONLY the retrieved verses and hadiths provided in the context below. Never use your own knowledge to add unretrieved Quran citations or hadith.
2. Every claim about what the Quran says MUST cite the specific Surah:Ayah reference from the context (e.g., "Quran 2:183").
3. Every claim about what a hadith says MUST cite the collection and number from the context (e.g., "Sahih al-Bukhari #8").
4. Clearly separate the types of evidence.
5. If a SCHOLARLY EXPLANATION section is provided in the context, you may reference it in your answer, but always attribute it clearly — e.g., "According to Ibn Kathir's tafsir..." or "Ma'arif al-Qur'an explains...". Never present tafsir content as if it were your own explanation. If no SCHOLARLY EXPLANATION is present, do not fabricate one.
6. If the retrieved context does not contain enough to answer confidently, say honestly: "I could not find a direct verse or hadith addressing this exact question" rather than fabricating an answer.
7. For topics where Islamic scholars genuinely differ (e.g., fiqh rulings), present it as "Scholars differ on this issue" rather than a single definitive ruling. Do NOT issue a personal fatwa. Suggest consulting a qualified scholar for specific personal rulings.
8. Never fabricate a verse, hadith, chain of narration, or scholarly quotation.

At the end of your response, on its own line, add one of these confidence indicators:
[CONFIDENCE: green] — direct Quran verse or authentic hadith clearly addresses the question
[CONFIDENCE: yellow] — general scholarly understanding inferred from multiple sources, no single direct verse/hadith
[CONFIDENCE: orange] — weaker evidence or minority opinion only
[CONFIDENCE: red] — no clear textual evidence found`;

    const userMsg = `Question: ${question}\n\nRetrieved context:\n${contextStr}\n\nAnswer my question using ONLY the context above. If the context lacks enough to answer, say so honestly.`;

    console.log(`[Quran-Answer] calling NVIDIA (messages length: ${systemPrompt.length + userMsg.length} chars)...`);
    const result = await callNvidia([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ]);

    if (!result.ok) {
      console.log(`[Quran-Answer] NVIDIA call failed: ${result.error}`);
      // Still return retrieved context even if LLM fails
      return new Response(JSON.stringify({
        answer: null,
        error: result.error,
        noResults: false,
        quranVerses: quranVersesFinal,
        hadiths,
        tafsir: tafsir ? { source: tafsir.name, author: tafsir.author, text: tafsir.text.slice(0, 2000) } : null,
        confidence: 'red',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[Quran-Answer] answer length=${result.content.length}`);

    // Parse confidence from answer
    let confidence = 'green';
    const confidenceMatch = result.content.match(/\[CONFIDENCE:\s*(green|yellow|orange|red)\]/i);
    if (confidenceMatch) {
      confidence = confidenceMatch[1].toLowerCase();
    }
    const cleanAnswer = result.content.replace(/\[CONFIDENCE:\s*(green|yellow|orange|red)\]/gi, '').trim();

    return new Response(JSON.stringify({
      answer: cleanAnswer,
      error: null,
      noResults: false,
      quranVerses: quranVersesFinal,
      hadiths,
      tafsir: tafsir ? { source: tafsir.name, author: tafsir.author, text: tafsir.text.slice(0, 2000) } : null,
      confidence,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(`[Quran-Answer] error:`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
