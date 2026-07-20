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

    // Get the user from the JWT
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

    // Save user message
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

    // Load chat history for context
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    const messages = (history || []).map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    // Call NVIDIA NIM
    const nvidiaRes = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nvidiaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages,
      }),
    });

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      return new Response(JSON.stringify({ error: `NVIDIA API error: ${errText}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const nvidiaData = await nvidiaRes.json();
    const reply = nvidiaData.choices?.[0]?.message?.content || '';

    // Save assistant reply
    const { error: assistantMsgError } = await supabase.from('messages').insert({
      chat_id: chatId,
      role: 'assistant',
      content: reply,
    });

    if (assistantMsgError) {
      return new Response(JSON.stringify({ error: assistantMsgError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
