import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;
const tavilyApiKey = Deno.env.get('TAVILY_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const MODEL = 'deepseek-ai/deepseek-v4-flash';

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

async function callNvidia(messages: unknown[], tools?: unknown[]) {
  const body: Record<string, unknown> = { model: MODEL, messages, stream: false };
  if (tools) body.tools = tools;
  return fetch(NVIDIA_ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${nvidiaApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
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

    await supabase.from('messages').insert({ chat_id: chatId, role: 'user', content: message });

    const { data: history } = await supabase.from('messages').select('role, content').eq('chat_id', chatId).order('created_at');
    const msgs = (history || []).map((m) => ({ role: m.role, content: m.content }));

    const res1 = await callNvidia(msgs, makeTools());
    if (!res1.ok) {
      const errText = await res1.text();
      if (res1.status === 503) {
        const fallbackRes = await callNvidia(msgs);
        if (fallbackRes.ok) {
          const fb = await fallbackRes.json();
          const c = fb.choices?.[0]?.message?.content || '';
          await supabase.from('messages').insert({ chat_id: chatId, role: 'assistant', content: c });
          return new Response(JSON.stringify({ content: c, usedSearch: false, sources: [] }), { headers: { 'Content-Type': 'application/json' } });
        }
      }
      return new Response(JSON.stringify({ error: `NVIDIA: ${errText.slice(0, 500)}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const data1 = await res1.json();
    const choice1 = data1.choices?.[0];
    const tc = choice1?.message?.tool_calls?.[0];
    const reply = choice1?.message?.content || '';

    let finalContent = reply;
    let usedSearch = false;
    let sources: { title: string; url: string }[] = [];

    if (tc?.function?.name === 'search_web') {
      usedSearch = true;
      let query = '';
      try { query = JSON.parse(tc.function.arguments).query; } catch { query = tc.function.arguments || ''; }

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

        const toolMsgs = [
          ...msgs,
          { role: 'assistant', content: null, tool_calls: [{ id: tc.id, type: 'function', function: { name: 'search_web', arguments: tc.function.arguments } }] },
          { role: 'tool', tool_call_id: tc.id, content: toolContent },
        ];

        const res2 = await callNvidia(toolMsgs);
        if (res2.ok) {
          const d2 = await res2.json();
          finalContent = d2.choices?.[0]?.message?.content || '';
        }
      }
    }

    const payload: Record<string, unknown> = { chat_id: chatId, role: 'assistant', content: finalContent };
    if (usedSearch) { payload.used_web_search = true; payload.sources = sources; }
    await supabase.from('messages').insert(payload);

    return new Response(JSON.stringify({ content: finalContent, usedSearch, sources }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
