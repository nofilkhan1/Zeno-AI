import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ummahApiKey = Deno.env.get('UMMAH_API_KEY');

const UMMAH_BASE = 'https://ummahapi.com';

const STOPWORDS = new Set([
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

// Same keyword extraction used by quran-answer — strips question words
// and keeps only meaningful topic terms
function extractKeywords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

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

    const { query, collection, limit } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const keywords = extractKeywords(query);
    const searchQuery = keywords.length > 0 ? keywords.join(' ') : query;
    console.log(`[Hadith-Search] raw="${query}" extracted=[${keywords.join(', ')}] search="${searchQuery}" collection="${collection || 'all'}"`);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) headers['x-api-key'] = ummahApiKey;

    const params = new URLSearchParams({ q: searchQuery, limit: String(limit || 10) });
    if (collection) params.set('collection', collection);

    const url = `${UMMAH_BASE}/api/hadith/search?${params}`;

    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Hadith search failed');
    }

    return new Response(JSON.stringify({
      query: data.data.query,
      collection: data.data.collection,
      totalFound: data.data.total_found,
      hadiths: (data.data.hadiths || []).map((h: Record<string, unknown>) => ({
        id: h.id,
        collection: h.collection,
        collectionName: h.collection_name,
        hadithNumber: h.hadithnumber,
        arabic: h.arabic,
        english: h.english,
        grade: h.grade,
      })),
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[Hadith-Search] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
