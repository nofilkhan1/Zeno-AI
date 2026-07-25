// Utility edge function: generate embeddings via NVIDIA NIM
// Used by the batch embedding script and by quran-semantic-search at query time
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;

const NVIDIA_EMBED_URL = 'https://integrate.api.nvidia.com/v1/embeddings';
const EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5';
const MAX_BATCH = 100;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
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

    const { texts, input_type } = await req.json();
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid texts array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (texts.length > MAX_BATCH) {
      return new Response(JSON.stringify({ error: `Max batch size is ${MAX_BATCH}, got ${texts.length}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const nvidiaRes = await fetch(NVIDIA_EMBED_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${nvidiaApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: texts,
        model: EMBED_MODEL,
        input_type: input_type || 'passage',
      }),
    });

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      console.error(`[quran-embed] NVIDIA error ${nvidiaRes.status}: ${errText.slice(0, 500)}`);
      return new Response(JSON.stringify({ error: `Embedding failed: ${errText.slice(0, 200)}` }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await nvidiaRes.json();
    const embeddings = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);

    console.log(`[quran-embed] embedded ${texts.length} texts, dim=${embeddings[0]?.length}, model=${EMBED_MODEL}`);

    return new Response(JSON.stringify({ embeddings, model: EMBED_MODEL, dimension: embeddings[0]?.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[quran-embed]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
