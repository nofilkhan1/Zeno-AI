import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;
const tavilyApiKey = Deno.env.get('TAVILY_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_MODEL = 'nvidia/nemotron-mini-4b-instruct';
const NVIDIA_TIMEOUT = 15_000;

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 10;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = rateMap.get(userId);
  if (!entry || now >= entry.resetAt) {
    rateMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

function makeTools() {
  return [{
    type: 'function' as const,
    function: {
      name: 'search_web',
      description: 'Search the web for current information.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  }];
}

async function callNvidia(
  messages: unknown[],
  tools?: unknown[],
  model?: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const modelId = model || DEFAULT_MODEL;
  const body: Record<string, unknown> = { model: modelId, messages, stream: false };
  if (tools) body.tools = tools;

  console.log(`NVIDIA call: model=${modelId}, messages=${messages.length}, tools=${tools ? 'yes' : 'no'}`);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), NVIDIA_TIMEOUT);

  try {
    const res = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${nvidiaApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`NVIDIA error: status=${res.status}, body=${errText.slice(0, 300)}`);
      return { ok: false, error: `NVIDIA returned ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.log(`NVIDIA timeout after ${NVIDIA_TIMEOUT}ms: model=${modelId}`);
      return { ok: false, error: `Model "${modelId}" timed out after ${NVIDIA_TIMEOUT / 1000}s. Try a different model.` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`NVIDIA fetch error: ${msg}`);
    return { ok: false, error: `Failed to call NVIDIA: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

async function generateTitle(userMessage: string): Promise<string> {
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), NVIDIA_TIMEOUT);

    const res = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${nvidiaApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: 'Summarize this message as a short title (max 6 words, no quotes, no punctuation). Reply with only the title.' },
          { role: 'user', content: userMessage },
        ],
        stream: false,
      }),
      signal: abort.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return 'New Chat';
    const data = await res.json();
    const title = data.choices?.[0]?.message?.content?.trim() || 'New Chat';
    return title.length > 60 ? title.slice(0, 60) : title;
  } catch {
    return 'New Chat';
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const { chatId, message } = await req.json();

    if (!chatId || !message) {
      return new Response(JSON.stringify({ error: 'chatId and message required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[${requestId}] user=${user.id} chat=${chatId} message="${message.slice(0, 80)}"`);

    const { allowed, retryAfter } = checkRateLimit(user.id);
    if (!allowed) {
      console.log(`[${requestId}] rate limited`);
      return new Response(JSON.stringify({ error: `Rate limited. Try again in ${retryAfter}s.` }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: chat } = await supabase.from('chats').select('model').eq('id', chatId).single();
    const model = chat?.model || DEFAULT_MODEL;
    console.log(`[${requestId}] model=${model}`);

    const { data: existingMsgs } = await supabase.from('messages').select('id').eq('chat_id', chatId).limit(1);
    const isFirstMessage = !existingMsgs || existingMsgs.length === 0;

    await supabase.from('messages').insert({ chat_id: chatId, role: 'user', content: message });

    if (isFirstMessage) {
      const title = await generateTitle(message);
      await supabase.from('chats').update({ title }).eq('id', chatId);
      console.log(`[${requestId}] title="${title}"`);
    }

    const { data: history } = await supabase.from('messages').select('role, content').eq('chat_id', chatId).order('created_at');
    const msgs = (history || []).map((m) => ({ role: m.role, content: m.content }));

    console.log(`[${requestId}] calling NVIDIA with tools...`);
    const r1 = await callNvidia(msgs, makeTools(), model);
    if (!r1.ok) {
      console.log(`[${requestId}] first call failed: ${r1.error}`);

      // Only retry without tools on 503 (service overload), not on timeout/bad model
      const isServiceBusy = r1.error.includes('503') || r1.error.includes('Service Unavailable');
      if (isServiceBusy) {
        const fallback = await callNvidia(msgs, undefined, model);
        if (fallback.ok) {
          const d = fallback.data as { choices: { message: { content: string } }[] };
          const c = d.choices?.[0]?.message?.content || '';
          if (c) {
            await supabase.from('messages').insert({ chat_id: chatId, role: 'assistant', content: c });
            console.log(`[${requestId}] fallback succeeded, content=${c.slice(0, 60)}`);
            return new Response(JSON.stringify({ content: c, usedSearch: false, sources: [] }), { headers: { 'Content-Type': 'application/json' } });
          }
        }
      }

      return new Response(JSON.stringify({ error: r1.error }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const data1 = r1.data as { choices: { message: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
    const choice1 = data1.choices?.[0];
    const tc = choice1?.message?.tool_calls?.[0];
    const reply = choice1?.message?.content || '';

    console.log(`[${requestId}] response: toolCall=${!!tc} contentLen=${reply.length}`);

    let finalContent = reply;
    let usedSearch = false;
    let sources: { title: string; url: string }[] = [];

    if (tc?.function?.name === 'search_web') {
      usedSearch = true;
      let query = '';
      try { query = JSON.parse(tc.function.arguments).query; } catch { query = tc.function.arguments || ''; }
      console.log(`[${requestId}] search query="${query}"`);

      const sres = await fetch(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyApiKey, query, search_depth: 'basic', max_results: 5 }),
      });

      if (sres.ok) {
        const sd = await sres.json();
        const results = sd.results || [];
        sources = results.map((r: { title: string; url: string }) => ({ title: r.title, url: r.url }));
        const toolContent = results.length
          ? results.map((r: { title: string; url: string; content: string }, i: number) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`).join('\n\n')
          : 'No results found.';

        console.log(`[${requestId}] search returned ${results.length} results`);

        const toolMsgs = [
          ...msgs,
          { role: 'assistant', content: null, tool_calls: [{ id: tc.id, type: 'function', function: { name: 'search_web', arguments: tc.function.arguments } }] },
          { role: 'tool', tool_call_id: tc.id, content: toolContent },
        ];

        console.log(`[${requestId}] calling NVIDIA with search results...`);
        const r2 = await callNvidia(toolMsgs, undefined, model);
        if (r2.ok) {
          const d2 = r2.data as { choices: { message: { content: string } }[] };
          finalContent = d2.choices?.[0]?.message?.content || '';
        }
      }
    }

    const payload: Record<string, unknown> = { chat_id: chatId, role: 'assistant', content: finalContent };
    if (usedSearch) { payload.used_web_search = true; payload.sources = sources; }
    await supabase.from('messages').insert(payload);
    console.log(`[${requestId}] saved assistant msg, len=${finalContent.length} search=${usedSearch}`);

    return new Response(JSON.stringify({ content: finalContent, usedSearch, sources }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${requestId}] unhandled error: ${msg}`);
    return new Response(JSON.stringify({ error: `Server error: ${msg}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
