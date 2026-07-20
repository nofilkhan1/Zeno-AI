import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

Deno.serve(async (req) => {
  try {
    const { chatId, message } = await req.json();

    if (!chatId || !message) {
      return new Response(JSON.stringify({ error: 'chatId and message are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    let userId: string | undefined;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error: userMsgError } = await supabase.from('messages').insert({
      chat_id: chatId,
      role: 'user',
      content: message,
    });

    if (userMsgError) {
      return new Response(JSON.stringify({ error: userMsgError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    const messages = (history || []).map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    const nvidiaRes = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nvidiaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages,
        stream: true,
      }),
    });

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      return new Response(JSON.stringify({ error: `NVIDIA API error: ${errText}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const nvidiaReader = nvidiaRes.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await nvidiaReader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

            for (const line of lines) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullReply += content;
                  controller.enqueue(new TextEncoder().encode(content));
                }
              } catch {
                // skip malformed JSON lines
              }
            }
          }

          const { error: saveError } = await supabase.from('messages').insert({
            chat_id: chatId,
            role: 'assistant',
            content: fullReply,
          });

          if (saveError) {
            console.error('Failed to save assistant reply:', saveError.message);
          }

          controller.close();
        } catch (err) {
          if (fullReply) {
            await supabase.from('messages').insert({
              chat_id: chatId,
              role: 'assistant',
              content: fullReply,
            }).then().catch(() => {});
          }
          controller.error(err);
        }
      },
    });

    req.signal.addEventListener('abort', async () => {
      if (fullReply) {
        await supabase.from('messages').insert({
          chat_id: chatId,
          role: 'assistant',
          content: fullReply,
        }).then().catch(() => {});
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
