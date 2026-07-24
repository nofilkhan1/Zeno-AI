import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;
const ummahApiKey = Deno.env.get('UMMAH_API_KEY')!;

const UMMAH_BASE = 'https://ummahapi.com';
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_TIMEOUT = 30_000;

async function callNvidia(messages: unknown[]): Promise<string> {
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
      throw new Error(`NVIDIA ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

// Simple keyword extraction: remove common stopwords, keep significant words
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
  ]);
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
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
    const searchQuery = keywords.join(' ');
    console.log(`[Quran-Answer] keywords="${keywords.join(', ')}" searchQuery="${searchQuery}"`);

    if (!searchQuery) {
      return new Response(JSON.stringify({
        answer: null,
        error: 'Could not extract meaningful search terms from your question. Try rephrasing with specific keywords.',
        quranVerses: [],
        hadiths: [],
        confidence: null,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const apiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) apiHeaders['x-api-key'] = ummahApiKey;

    // Parallel: search Quran + Hadith
    const quranParams = new URLSearchParams({ q: searchQuery, translation: translation || 'sahih_international', limit: '8' });
    const hadithParams = new URLSearchParams({ q: searchQuery, limit: '5' });

    const [quranRes, hadithRes] = await Promise.all([
      fetch(`${UMMAH_BASE}/api/quran/search?${quranParams}`, { headers: apiHeaders }),
      fetch(`${UMMAH_BASE}/api/hadith/search?${hadithParams}`, { headers: apiHeaders }),
    ]);

    const quranData = await quranRes.json();
    const hadithData = await hadithRes.json();

    const quranVerses = quranData.success
      ? (quranData.data?.results || []).map((r: Record<string, unknown>) => ({
          verseKey: r.verse_key,
          surahNumber: r.surah_number,
          surahName: r.surah_name,
          ayah: r.ayah,
          arabic: r.arabic,
          translation: r.translation,
          translationSource: r.translation_source,
        }))
      : [];

    const hadiths = hadithData.success
      ? (hadithData.data?.hadiths || []).map((h: Record<string, unknown>) => ({
          id: h.id,
          collection: h.collection,
          collectionName: h.collection_name,
          hadithNumber: h.hadithnumber,
          arabic: h.arabic,
          english: h.english,
          grade: h.grade,
        }))
      : [];

    console.log(`[Quran-Answer] found ${quranVerses.length} verses, ${hadiths.length} hadiths`);

    // No-fabrication safeguard
    if (quranVerses.length === 0 && hadiths.length === 0) {
      console.log(`[Quran-Answer] no results found, skipping LLM`);
      return new Response(JSON.stringify({
        answer: null,
        error: null,
        noResults: true,
        quranVerses: [],
        hadiths: [],
        confidence: 'red',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Build context for LLM
    let contextParts: string[] = [];

    if (quranVerses.length > 0) {
      contextParts.push('=== QURAN VERSES (RETRIEVED) ===');
      quranVerses.forEach((v: { verseKey: string; surahName: string; arabic: string; translation: string }, i: number) => {
        contextParts.push(`[Q${i + 1}] ${v.verseKey} (${v.surahName})`);
        contextParts.push(`Arabic: ${v.arabic}`);
        contextParts.push(`Translation: ${v.translation}`);
      });
    }

    if (hadiths.length > 0) {
      contextParts.push('');
      contextParts.push('=== AUTHENTIC HADITHS (RETRIEVED) ===');
      hadiths.forEach((h: { collection: string; collectionName: string; hadithNumber: number; english: string; grade: string }, i: number) => {
        contextParts.push(`[H${i + 1}] ${h.collectionName} #${h.hadithNumber} (Grade: ${h.grade})`);
        contextParts.push(`Text: ${h.english}`);
      });
    }

    const contextStr = contextParts.join('\n');

    const systemPrompt = `You are a knowledgeable Islamic studies assistant. Your role is to answer questions about Islam using ONLY the retrieved Quran verses and authentic hadiths provided below as context.

CRITICAL RULES:
1. Answer using ONLY the retrieved verses and hadiths provided in the context below. Never use your own knowledge to add unretrieved Quran citations or hadith.
2. Every claim about what the Quran says MUST cite the specific Surah:Ayah reference from the context (e.g., "Quran 2:183").
3. Every claim about what a hadith says MUST cite the collection and number from the context (e.g., "Sahih al-Bukhari #8").
4. Clearly separate the types of evidence:
   - QURAN: verse + reference
   - AUTHENTIC HADITH: reference + grade
   - If you provide general scholarly understanding, label it as "General understanding" — never fabricate a named scholar's opinion unless it was actually retrieved.
5. If the retrieved context does not contain enough to answer confidently, say honestly: "I could not find a direct verse or hadith addressing this exact question" rather than fabricating an answer.
6. For topics where Islamic scholars genuinely differ (e.g., fiqh rulings), present it as "Scholars differ on this issue" rather than a single definitive ruling. Do NOT issue a personal fatwa. Suggest consulting a qualified scholar for specific personal rulings.
7. Never fabricate a verse, hadith, chain of narration, or scholarly quotation.

STRUCTURE YOUR RESPONSE:
- Short direct answer summary (1-3 sentences)
- Then organized evidence sections

At the end of your response, on its own line, add one of these confidence indicators:
[CONFIDENCE: green] — direct Quran verse or authentic hadith clearly addresses the question
[CONFIDENCE: yellow] — general scholarly understanding inferred from multiple sources, no single direct verse/hadith
[CONFIDENCE: orange] — weaker evidence or minority opinion only
[CONFIDENCE: red] — no clear textual evidence found`;

    const userMsg = `Question: ${question}\n\nRetrieved context:\n${contextStr}\n\nAnswer my question using ONLY the context above. If the context lacks enough to answer, say so honestly.`;

    console.log(`[Quran-Answer] calling NVIDIA...`);
    const answer = await callNvidia([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ]);
    console.log(`[Quran-Answer] answer length=${answer.length}`);

    // Parse confidence from answer
    let confidence = 'green';
    const confidenceMatch = answer.match(/\[CONFIDENCE:\s*(green|yellow|orange|red)\]/i);
    if (confidenceMatch) {
      confidence = confidenceMatch[1].toLowerCase();
    }
    const cleanAnswer = answer.replace(/\[CONFIDENCE:\s*(green|yellow|orange|red)\]/gi, '').trim();

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
