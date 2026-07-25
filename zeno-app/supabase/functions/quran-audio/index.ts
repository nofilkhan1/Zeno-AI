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

    const { surah, ayah, reciterId } = await req.json();
    if (!surah || !ayah) {
      return new Response(JSON.stringify({ error: 'Missing surah or ayah' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) headers['x-api-key'] = ummahApiKey;

    const url = `${UMMAH_BASE}/api/quran/audio/${surah}/${ayah}`;
    console.log(`[Quran-Audio] surah=${surah} ayah=${ayah} reciterId=${reciterId || 'all'}`);

    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Audio fetch failed');
    }

    const reciters = data.data?.reciters || [];
    const filtered = reciterId
      ? reciters.filter((r: Record<string, unknown>) => r.id === reciterId)
      : reciters;

    return new Response(JSON.stringify({
      verseKey: data.data.verse_key,
      surah: data.data.surah,
      reciters: filtered.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        style: r.style,
        audioUrl: r.audio_url,
      })),
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[Quran-Audio] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
