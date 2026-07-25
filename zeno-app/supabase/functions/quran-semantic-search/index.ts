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

    const { query, match_count } = await req.json();
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing query string' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Generate query embedding via NVIDIA
    const embedRes = await fetch(NVIDIA_EMBED_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${nvidiaApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [query], model: EMBED_MODEL, input_type: 'query' }),
    });

    if (!embedRes.ok) {
      const err = await embedRes.text();
      console.error('[quran-semantic-search] NVIDIA embed error:', embedRes.status, err.slice(0, 300));
      return new Response(JSON.stringify({ error: `Embedding failed: ${err.slice(0, 200)}` }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const embedData = await embedRes.json();
    const queryEmbedding = embedData.data[0]?.embedding;
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      return new Response(JSON.stringify({ error: 'Invalid embedding response' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Call match_quran_verses RPC
    const { data: results, error: rpcError } = await supabase.rpc('match_quran_verses', {
      query_embedding: queryEmbedding,
      match_count: match_count || 5,
    });

    if (rpcError) {
      console.error('[quran-semantic-search] RPC error:', rpcError);
      return new Response(JSON.stringify({ error: 'Search failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[quran-semantic-search] query="${query}" found ${results?.length || 0} matches`);

    return new Response(JSON.stringify({ verses: results || [] }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[quran-semantic-search]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});