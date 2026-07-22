const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
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

    const dgRes = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!dgRes.ok) {
      const body = await dgRes.text().catch(() => '');
      throw new Error(`Deepgram TTS error ${dgRes.status}: ${body}`);
    }

    const audioBuf = await dgRes.arrayBuffer();

    return new Response(audioBuf, {
      headers: { 'Content-Type': 'audio/wav' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
