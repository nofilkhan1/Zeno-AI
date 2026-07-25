import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ummahApiKey = Deno.env.get('UMMAH_API_KEY');

const UMMAH_BASE = 'https://ummahapi.com';

const SURAH_AYAH_COUNTS: Record<number, number> = {
  1:7,2:286,3:200,4:176,5:120,6:165,7:206,8:75,9:129,10:109,
  11:123,12:111,13:43,14:52,15:99,16:128,17:111,18:110,19:98,20:135,
  21:112,22:78,23:118,24:64,25:77,26:227,27:93,28:88,29:69,30:60,
  31:34,32:30,33:73,34:54,35:45,36:83,37:182,38:88,39:75,40:85,
  41:54,42:53,43:89,44:59,45:37,46:35,47:38,48:29,49:18,50:45,
  51:60,52:49,53:62,54:55,55:78,56:96,57:29,58:22,59:24,60:13,
  61:14,62:11,63:11,64:18,65:12,66:12,67:30,68:52,69:52,70:44,
  71:28,72:28,73:20,74:56,75:40,76:31,77:50,78:40,79:46,80:42,
  81:29,82:19,83:36,84:25,85:22,86:17,87:19,88:26,89:30,90:20,
  91:15,92:21,93:11,94:8,95:8,96:19,97:5,98:8,99:8,100:11,
  101:11,102:8,103:3,104:9,105:5,106:4,107:7,108:3,109:6,110:3,
  111:5,112:4,113:5,114:6,
};

const SURAH_NAMES: Record<number, string> = {
  1:'Al-Fatihah',2:'Al-Baqarah',3:'Aal-e-Imran',4:'An-Nisa',5:'Al-Maidah',
  6:"Al-An'am",7:"Al-A'raf",8:'Al-Anfal',9:'At-Tawbah',10:'Yunus',
  11:'Hud',12:'Yusuf',13:"Ar-Ra'd",14:'Ibrahim',15:'Al-Hijr',
  16:'An-Nahl',17:'Al-Isra',18:'Al-Kahf',19:'Maryam',20:'Ta-Ha',
  21:'Al-Anbiya',22:'Al-Hajj',23:"Al-Mu'minun",24:'An-Nur',25:'Al-Furqan',
  26:"Ash-Shu'ara",27:'An-Naml',28:'Al-Qasas',29:'Al-Ankabut',30:'Ar-Rum',
  31:'Luqman',32:'As-Sajdah',33:'Al-Ahzab',34:'Saba',35:'Al-Fatir',
  36:'Ya-Sin',37:'As-Saffat',38:'Sad',39:'Az-Zumar',40:'Al-Ghafir',
  41:'Fussilat',42:'Ash-Shura',43:'Az-Zukhruf',44:'Ad-Dukhan',45:'Al-Jathiya',
  46:'Al-Ahqaf',47:'Muhammad',48:'Al-Fath',49:'Al-Hujurat',50:'Qaf',
  51:'Adh-Dhariyat',52:'At-Tur',53:'An-Najm',54:'Al-Qamar',55:'Ar-Rahman',
  56:"Al-Waqi'ah",57:'Al-Hadid',58:'Al-Mujadila',59:'Al-Hashr',60:'Al-Mumtahanah',
  61:'As-Saff',62:"Al-Jumu'ah",63:'Al-Munafiqun',64:'At-Taghabun',65:'At-Talaq',
  66:'At-Tahrim',67:'Al-Mulk',68:'Al-Qalam',69:'Al-Haqqah',70:"Al-Ma'arij",
  71:'Nuh',72:'Al-Jinn',73:'Al-Muzzammil',74:'Al-Muddaththir',75:'Al-Qiyamah',
  76:'Al-Insan',77:'Al-Mursalat',78:'An-Naba',79:"An-Nazi'at",80:'Abasa',
  81:'At-Takwir',82:'Al-Infitar',83:'Al-Mutaffifin',84:'Al-Inshiqaq',85:'Al-Buruj',
  86:'At-Tariq',87:"Al-A'la",88:'Al-Ghashiyah',89:'Al-Fajr',90:'Al-Balad',
  91:'Ash-Shams',92:'Al-Layl',93:'Ad-Duha',94:'Ash-Sharh',95:'At-Tin',
  96:'Al-Alaq',97:'Al-Qadr',98:'Al-Bayyinah',99:'Az-Zalzalah',100:"Al-'Adiyat",
  101:"Al-Qari'ah",102:'At-Takathur',103:"Al-'Asr",104:'Al-Humazah',105:'Al-Fil',
  106:'Quraysh',107:"Al-Ma'un",108:'Al-Kawthar',109:'Al-Kafirun',110:'An-Nasr',
  111:'Al-Masad',112:'Al-Ikhlas',113:'Al-Falaq',114:'An-Nas',
};

interface RawVerse {
  success: boolean;
  data: {
    verse: {
      verse_key: string;
      arabic: string;
      translations: Record<string, string>;
    };
    surah: { number: number; name_english: string };
  };
}

type QuestionType = 'complete' | 'surah' | 'translation';

interface QuizQuestion {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  verseKey: string;
  arabic?: string;
  translation?: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomSurah(exclude?: number): number {
  let s: number;
  do { s = Math.floor(Math.random() * 114) + 1; } while (s === exclude);
  return s;
}

function randomAyah(surah: number): number {
  const max = SURAH_AYAH_COUNTS[surah] || 6;
  return Math.floor(Math.random() * max) + 1;
}

async function fetchVerse(surah: number, ayah: number, headers: Record<string, string>): Promise<RawVerse['data'] | null> {
  try {
    const res = await fetch(`${UMMAH_BASE}/api/quran/surah/${surah}/ayah/${ayah}`, { headers });
    const data: RawVerse = await res.json();
    if (!data.success || !data.data?.verse?.translations?.sahih_international) return null;
    return data.data;
  } catch {
    return null;
  }
}

function makeCompleteQuestion(verse: RawVerse['data'], distractorVerses: RawVerse['data'][]): QuizQuestion | null {
  const translation = verse.verse.translations.sahih_international;
  const words = translation.split(/\s+/);
  if (words.length < 6) return null;

  const splitAt = Math.floor(words.length * 0.5);
  const stem = words.slice(0, splitAt).join(' ');
  const completion = words.slice(splitAt).join(' ');

  const distractors: string[] = [];
  for (const dv of distractorVerses) {
    if (!dv) continue;
    const dWords = dv.verse.translations.sahih_international.split(/\s+/);
    if (dWords.length >= 4) {
      const dSplit = Math.floor(dWords.length * 0.4);
      const dComp = dWords.slice(dSplit).join(' ');
      if (dComp !== completion) distractors.push(dComp);
    }
  }

  if (distractors.length < 3) return null;

  const opts = shuffle([completion, ...distractors.slice(0, 3)]);
  return {
    type: 'complete',
    prompt: `Complete the verse:\n"${stem} ____"`,
    options: opts,
    correctIndex: opts.indexOf(completion),
    verseKey: verse.verse.verse_key,
    arabic: verse.verse.arabic,
    translation,
  };
}

function makeSurahQuestion(verse: RawVerse['data'], surahNum: number): QuizQuestion {
  const correctName = SURAH_NAMES[surahNum] || `Surah ${surahNum}`;
  const distractorNums = new Set<number>();
  while (distractorNums.size < 3) {
    const r = randomSurah(surahNum);
    distractorNums.add(r);
  }
  const distractors: string[] = [];
  for (const n of distractorNums) {
    distractors.push(SURAH_NAMES[n] || `Surah ${n}`);
  }
  const opts = shuffle([correctName, ...distractors]);
  return {
    type: 'surah',
    prompt: 'Which surah does this verse belong to?',
    options: opts,
    correctIndex: opts.indexOf(correctName),
    verseKey: verse.verse.verse_key,
    arabic: verse.verse.arabic,
    translation: verse.verse.translations.sahih_international,
  };
}

function makeTranslationQuestion(verse: RawVerse['data'], distractorVerses: RawVerse['data'][]): QuizQuestion | null {
  const correctTranslation = verse.verse.translations.sahih_international;
  const distractors: string[] = [];
  for (const dv of distractorVerses) {
    if (!dv) continue;
    const t = dv.verse.translations.sahih_international;
    if (t && t !== correctTranslation && !distractors.includes(t)) {
      distractors.push(t);
    }
  }
  if (distractors.length < 3) return null;

  const opts = shuffle([correctTranslation, ...distractors.slice(0, 3)]);
  return {
    type: 'translation',
    prompt: 'Select the correct English translation for this Arabic verse:',
    options: opts,
    correctIndex: opts.indexOf(correctTranslation),
    verseKey: verse.verse.verse_key,
    arabic: verse.verse.arabic,
    translation: correctTranslation,
  };
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
    const { data: { user: userData } } = await supabase.auth.getUser(token);
    if (!userData) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { action, surah: scopeSurah, count = 5 } = await req.json();

    if (action === 'generate') {
      const questionCount = Math.min(Math.max(count, 3), 20);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ummahApiKey) headers['x-api-key'] = ummahApiKey;

      // Pre-fetch a pool of random verses for distractors
      const poolSize = questionCount * 4;
      const poolVerses: RawVerse['data'][] = [];
      for (let i = 0; i < poolSize; i++) {
        const s = scopeSurah || randomSurah();
        const a = randomAyah(s);
        const v = await fetchVerse(s, a, headers);
        if (v) poolVerses.push(v);
        if (poolVerses.length >= poolSize) break;
      }
      if (poolVerses.length < 4) {
        return new Response(JSON.stringify({ error: 'Failed to fetch enough verse data' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }

      const questions: QuizQuestion[] = [];
      const types: QuestionType[] = ['complete', 'surah', 'translation'];
      let poolIndex = 0;

      for (let q = 0; q < questionCount; q++) {
        const type = types[q % types.length];
        const mainVerse = poolVerses[poolIndex % poolVerses.length];
        poolIndex++;

        if (!mainVerse) continue;

        const surahNum = scopeSurah || mainVerse.surah.number;

        if (type === 'complete') {
          // Get different verses for distractors
          const dStart = poolIndex % poolVerses.length;
          const distractors = [];
          for (let i = 0; i < 4; i++) {
            const dv = poolVerses[(dStart + i) % poolVerses.length];
            if (dv && dv.verse.verse_key !== mainVerse.verse.verse_key) distractors.push(dv);
          }
          const qq = makeCompleteQuestion(mainVerse, distractors);
          if (qq) questions.push(qq);
        } else if (type === 'surah') {
          questions.push(makeSurahQuestion(mainVerse, surahNum));
        } else if (type === 'translation') {
          const dStart = poolIndex % poolVerses.length;
          const distractors = [];
          for (let i = 0; i < 4; i++) {
            const dv = poolVerses[(dStart + i) % poolVerses.length];
            if (dv && dv.verse.verse_key !== mainVerse.verse.verse_key) distractors.push(dv);
          }
          const qq = makeTranslationQuestion(mainVerse, distractors);
          if (qq) questions.push(qq);
        }

        if (questions.length >= questionCount) break;
      }

      if (questions.length === 0) {
        return new Response(JSON.stringify({ error: 'Could not generate questions. Try again.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ questions }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'save-result') {
      const { score, total, surah } = await req.json();
      const { error } = await supabase.from('quiz_results').insert({
        user_id: userData.id,
        score: score ?? 0,
        total: total ?? 0,
        surah: surah || null,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'history') {
      const { data, error } = await supabase
        .from('quiz_results')
        .select('*')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return new Response(JSON.stringify({ results: data || [] }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Quiz] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
