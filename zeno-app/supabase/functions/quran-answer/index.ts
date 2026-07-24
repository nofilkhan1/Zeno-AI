import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;
const ummahApiKey = Deno.env.get('UMMAH_API_KEY')!;

const UMMAH_BASE = 'https://ummahapi.com';
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_TIMEOUT = 60_000;
const MAX_CONTEXT_CHARS = 6_000;

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

    if (keywords.length === 0) {
      return new Response(JSON.stringify({
        answer: null,
        error: 'Could not extract meaningful search terms from your question.',
        quranVerses: [],
        hadiths: [],
        noResults: true,
        confidence: 'red',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const apiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) apiHeaders['x-api-key'] = ummahApiKey;

    // Build search terms: start with English keywords, add Arabic fallbacks
    const searchTerms = new Set<string>([...keywords]);
    for (const kw of keywords) {
      const fallbacks = ARABIC_FALLBACKS[kw];
      if (fallbacks) {
        for (const fb of fallbacks) searchTerms.add(fb);
      }
    }
    console.log(`[Quran-Answer] search terms="${[...searchTerms].join(', ')}"`);

    const tr = translation || 'sahih_international';

    // Search each term individually — UmmahAPI multi-word search fails
    // when any word doesn't match Quranic text. Single-term search is reliable.
    const termArray = [...searchTerms];
    const quranPromises = termArray.map((t) => searchQuran(t, tr, apiHeaders));
    const hadithPromises = termArray.map((t) => searchHadith(t, apiHeaders));

    const [quranResults, hadithResults] = await Promise.all([
      Promise.all(quranPromises),
      Promise.all(hadithPromises),
    ]);

    // Merge and deduplicate Quran results (keep up to 8)
    const seenQuran = new Set<string>();
    const quranVerses = quranResults.flat().filter((v) => {
      if (seenQuran.has(v.verseKey)) return false;
      seenQuran.add(v.verseKey);
      return true;
    }).slice(0, 8);

    // Merge and deduplicate Hadith results (keep up to 5)
    const seenHadith = new Set<string>();
    const hadiths = hadithResults.flat().filter((h) => {
      const key = `${h.collection}-${h.hadithNumber}`;
      if (seenHadith.has(key)) return false;
      seenHadith.add(key);
      return true;
    }).slice(0, 5);

    console.log(`[Quran-Answer] merged results: ${quranVerses.length} verses, ${hadiths.length} hadiths`);

    // No-fabrication safeguard
    if (quranVerses.length === 0 && hadiths.length === 0) {
      console.log(`[Quran-Answer] no results found across any search term, skipping LLM`);
      return new Response(JSON.stringify({
        answer: null,
        error: null,
        noResults: true,
        quranVerses: [],
        hadiths: [],
        confidence: 'red',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Build context for LLM — truncate if too long to avoid context window issues
    let contextParts: string[] = [];
    let totalChars = 0;

    if (quranVerses.length > 0) {
      contextParts.push('=== QURAN VERSES (RETRIEVED) ===');
      totalChars += 40;
      for (let i = 0; i < quranVerses.length; i++) {
        const v = quranVerses[i];
        const entry = `[Q${i + 1}] ${v.verseKey} (${v.surahName})\nTranslation: ${v.translation}`;
        if (totalChars + entry.length > MAX_CONTEXT_CHARS) break;
        contextParts.push(entry);
        totalChars += entry.length;
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
5. If the retrieved context does not contain enough to answer confidently, say honestly: "I could not find a direct verse or hadith addressing this exact question" rather than fabricating an answer.
6. For topics where Islamic scholars genuinely differ (e.g., fiqh rulings), present it as "Scholars differ on this issue" rather than a single definitive ruling. Do NOT issue a personal fatwa. Suggest consulting a qualified scholar for specific personal rulings.
7. Never fabricate a verse, hadith, chain of narration, or scholarly quotation.

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
        quranVerses,
        hadiths,
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
      quranVerses,
      hadiths,
      confidence,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(`[Quran-Answer] error:`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
