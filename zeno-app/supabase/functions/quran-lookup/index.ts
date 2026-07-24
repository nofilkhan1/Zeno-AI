import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ummahApiKey = Deno.env.get('UMMAH_API_KEY');

const UMMAH_BASE = 'https://ummahapi.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { type, surah, ayah, query, translation, limit } = await req.json();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) {
      headers['x-api-key'] = ummahApiKey;
    }

    if (type === 'ayah') {
      if (!surah || !ayah) {
        return new Response(JSON.stringify({ error: 'Missing surah or ayah' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      const [ayahRes, transRes] = await Promise.all([
        fetch(`${UMMAH_BASE}/api/quran/surah/${surah}/ayah/${ayah}`, { headers }),
        fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quran-la1/${surah}/${ayah}.json`),
      ]);
      console.log('[Quran] Fetching ayah:', surah, ayah);

      const ayahData = await ayahRes.json();
      if (!ayahData.success) {
        throw new Error(ayahData.error || 'Failed to fetch ayah');
      }

      const v = ayahData.data.verse;
      let transliterationText = v.transliteration;
      if (transRes.ok) {
        const transData = await transRes.json();
        if (transData.text) {
          transliterationText = transData.text;
        }
      }

      const translationText = translation
        ? v.translations[translation]
        : v.translations.sahih_international;
      return new Response(JSON.stringify({
        surah: ayahData.data.surah,
        arabic: v.arabic,
        transliteration: transliterationText,
        translation: translationText,
        translationKey: translation || 'sahih_international',
        verseKey: v.verse_key,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (type === 'search') {
      if (!query) {
        return new Response(JSON.stringify({ error: 'Missing query' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      const params = new URLSearchParams({ q: query });
      if (translation) params.set('translation', translation);
      if (limit) params.set('limit', String(limit));
      const url = `${UMMAH_BASE}/api/quran/search?${params}`;
      console.log('[Quran] Searching:', url);
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }
      return new Response(JSON.stringify({
        query: data.data.query,
        results: data.data.results.map((r: Record<string, unknown>) => ({
          verseKey: r.verse_key,
          surahNumber: r.surah_number,
          surahName: r.surah_name,
          ayah: r.ayah,
          arabic: r.arabic,
          translation: r.translation,
          translationSource: r.translation_source,
        })),
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid type' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Quran] Function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
