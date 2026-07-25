import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;
const ummahApiKey = Deno.env.get('UMMAH_API_KEY');

const UMMAH_BASE = 'https://ummahapi.com';
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_TIMEOUT = 45_000;

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
      return { ok: false, error: `NVIDIA returned ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, error: 'NVIDIA returned empty response' };
    }
    return { ok: true, content };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { ok: false, error: `NVIDIA timed out after ${NVIDIA_TIMEOUT / 1000}s` };
    }
    return { ok: false, error: `NVIDIA call failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
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

    const { surah, ayah, translation } = await req.json();
    if (!surah || !ayah) {
      return new Response(JSON.stringify({ error: 'Missing surah or ayah' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) {
      headers['x-api-key'] = ummahApiKey;
    }

    // Fetch verse + tafsir in parallel
    const [ayahRes, tafsirRes] = await Promise.all([
      fetch(`${UMMAH_BASE}/api/quran/surah/${surah}/ayah/${ayah}`, { headers }),
      fetch(`${UMMAH_BASE}/api/tafsir/ibn_kathir/surah/${surah}/ayah/${ayah}`, { headers }),
    ]);

    if (!ayahRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch verse' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const ayahData = await ayahRes.json();
    if (!ayahData.success || !ayahData.data?.verse) {
      return new Response(JSON.stringify({ error: 'Verse not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const v = ayahData.data.verse;
    const surahInfo = ayahData.data.surah;
    const translationText = translation
      ? v.translations[translation]
      : v.translations.sahih_international;

    let tafsirText = '';
    let tafsirName = '';
    let tafsirAuthor = '';

    if (tafsirRes.ok) {
      const tafsirData = await tafsirRes.json();
      if (tafsirData.success && tafsirData.data?.tafsir?.text) {
        tafsirText = tafsirData.data.tafsir.text;
        tafsirName = tafsirData.data.tafsir.name;
        tafsirAuthor = tafsirData.data.tafsir.author;
      }
    }

    // Build context for LLM
    const verseContext = [
      `=== VERSE ===`,
      `Surah: ${surahInfo?.name_english || `Surah ${surah}`} (${surahInfo?.name_translation || ''})`,
      `Verse: ${v.verse_key}`,
      `Arabic: ${v.arabic}`,
      `Translation: ${translationText}`,
    ].join('\n');

    let tafsirContext = '';
    if (tafsirText) {
      tafsirContext = `\n\n=== SCHOLARLY TAFSIR ===\nSource: ${tafsirName} by ${tafsirAuthor}\n${tafsirText.slice(0, 2000)}`;
    }

    const contextStr = `${verseContext}${tafsirContext}`;

    const systemPrompt = `You are a contemplative reflection guide for tadabbur (Quranic reflection). Your purpose is to help the user personally connect with a single Quranic verse.

You have been provided with:
1. The Quranic verse (Arabic and translation)
2. A scholarly tafsir/exegesis (if available)

CRITICAL RULES:
1. Base your reflection ENTIRELY on the provided verse text and tafsir. Do NOT introduce additional Quranic verses, hadith, or interpretations not present in the provided sources.
2. If tafsir is provided, attribute any reference to it clearly — e.g., "Ibn Kathir explains that this verse refers to..."
3. If no tafsir is provided, do NOT fabricate scholarly claims.
4. Tone: Warm, personal, contemplative. Write as if speaking directly to someone seeking spiritual connection with this verse.
5. Include exactly 2-3 open-ended reflection questions at the end. These should help the reader apply the verse to their own life. Make them visually distinct — each on its own line, prefixed with a bullet or "•".
6. Do NOT issue rulings, fatwas, or definitive commands about what the reader should do.
7. Do NOT use the word "you must" or "you should" in a commanding way.
8. Keep language accessible and reflective, not academic or lecture-like.
9. Start directly with the reflection — no greeting like "Assalamu Alaikum" or "Dear user". Just begin.`;

    const userMsg = `Help me reflect on this verse:\n\n${contextStr}\n\nShare a reflection grounded in the tafsir above, followed by 2-3 personal reflection questions.`;

    const result = await callNvidia([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ]);

    if (!result.ok) {
      return new Response(JSON.stringify({
        error: result.error,
        verse: {
          verseKey: v.verse_key,
          surah: surahInfo,
          arabic: v.arabic,
          translation: translationText,
        },
        tafsir: tafsirText ? { source: tafsirName, author: tafsirAuthor, text: tafsirText.slice(0, 2000) } : null,
        reflection: null,
        questions: [],
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Parse out questions from the reflection
    const content = result.content;
    const questionLines: string[] = [];
    const reflectionLines: string[] = [];
    let inQuestions = false;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+[\.\)]/.test(trimmed)) {
        if (trimmed.length > 20 && /[?？]/.test(trimmed)) {
          questionLines.push(trimmed.replace(/^[•\-*\d\.\)\s]+/, '').trim());
          inQuestions = true;
          continue;
        }
      }
      if (!inQuestions) {
        reflectionLines.push(line);
      }
    }

    return new Response(JSON.stringify({
      error: null,
      verse: {
        verseKey: v.verse_key,
        surah: surahInfo,
        arabic: v.arabic,
        translation: translationText,
      },
      tafsir: tafsirText ? { source: tafsirName, author: tafsirAuthor, text: tafsirText.slice(0, 2000) } : null,
      reflection: reflectionLines.join('\n').trim(),
      questions: questionLines.length >= 2 ? questionLines : [],
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
