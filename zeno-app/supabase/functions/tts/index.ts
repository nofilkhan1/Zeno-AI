import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Validate auth
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

    const { text } = await req.json();
    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!deepgramApiKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[TTS] Calling Deepgram TTS API for text:', text.slice(0, 80));

    const dgRes = await fetch('https://api.deepgram.com/v1/speak?model=aura-orion-en', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    console.log('[TTS] Deepgram response status:', dgRes.status);

    if (!dgRes.ok) {
      const body = await dgRes.text().catch(() => '');
      console.error('[TTS] Deepgram error body:', body);
      throw new Error(`Deepgram TTS error ${dgRes.status}: ${body}`);
    }

    const audioBuf = await dgRes.arrayBuffer();
    console.log('[TTS] Received audio bytes:', audioBuf.byteLength);

    return new Response(audioBuf, {
      headers: { 'Content-Type': 'audio/wav' },
    });
  } catch (err) {
    console.error('[TTS] Function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
