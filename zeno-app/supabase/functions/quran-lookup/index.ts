import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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

    const { type, surah, ayah, query, translation, limit, source } = await req.json();

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

    if (type === 'words') {
      if (!surah || !ayah) {
        return new Response(JSON.stringify({ error: 'Missing surah or ayah' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      const url = `${UMMAH_BASE}/api/quran/words/${surah}/${ayah}`;
      console.log('[Quran] Fetching word-by-word:', url);
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!data.success || !data.data?.words) {
        return new Response(JSON.stringify({ error: 'No word data available for this verse' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      const words = (data.data.words || []).map((w: { position: number; arabic: string; translation: string }) => ({
        position: w.position,
        arabic: w.arabic,
        translation: w.translation?.trim() || '',
      }));
      return new Response(JSON.stringify({
        verseKey: data.data.verse_key,
        wordCount: data.data.word_count,
        words,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (type === 'tafsir') {
      if (!surah || !ayah) {
        return new Response(JSON.stringify({ error: 'Missing surah or ayah' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      const tafsirSource = source || 'ibn_kathir';
      const url = `${UMMAH_BASE}/api/tafsir/${tafsirSource}/surah/${surah}/ayah/${ayah}`;
      console.log('[Quran] Fetching tafsir:', url);
      const res = await fetch(url, { headers });
      const data = await res.json();
      // Validate verse exists (UmmahAPI returns fallback text for out-of-range verses)
      const maxAyah = SURAH_AYAH_COUNTS[surah];
      if (!maxAyah || ayah < 1 || ayah > maxAyah) {
        console.log(`[Quran] invalid verse: Surah ${surah} has ${maxAyah ?? 'unknown'} ayahs, requested ayah ${ayah}`);
        return new Response(JSON.stringify({ error: 'Tafsir not available for this verse' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!data.success || !data.data?.tafsir?.text) {
        return new Response(JSON.stringify({ error: 'Tafsir not available for this verse' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        verseKey: data.data.verse_key,
        tafsir: {
          key: data.data.tafsir.key,
          name: data.data.tafsir.name,
          language: data.data.tafsir.language,
          author: data.data.tafsir.author,
          text: data.data.tafsir.text,
        },
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
