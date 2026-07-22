import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');

// In-memory session store. Survives warm starts, cleared on cold start.
const sessions = new Map<string, { userId: string; expiresAt: number }>();

Deno.serve(async (req) => {
  if (!supabaseUrl || !supabaseServiceKey || !deepgramApiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const isWebSocket = req.headers.get('upgrade')?.toLowerCase() === 'websocket';

  // ── WebSocket: proxy to Deepgram ──────────────────────────
  if (isWebSocket) {
    const sessionId = url.searchParams.get('session');
    if (!sessionId) {
      const { socket, response } = Deno.upgradeWebSocket(req);
      socket.close(4001, 'Missing session');
      return response;
    }

    const session = sessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      sessions.delete(sessionId);
      const { socket, response } = Deno.upgradeWebSocket(req);
      socket.close(4001, 'Invalid or expired session');
      return response;
    }

    // Session valid — remove it (one-time use)
    sessions.delete(sessionId);

    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

    const pending: ArrayBuffer[] = [];
    const dgUrl = 'wss://api.deepgram.com/v1/listen?access_token=' + encodeURIComponent(deepgramApiKey!) + '&encoding=linear16&sample_rate=16000&channels=1&interim_results=true';
    console.log('[STT-PROXY] Creating DG WebSocket:', dgUrl.replace(deepgramApiKey!, 'REDACTED'));
    const dgWs = new WebSocket(dgUrl);

    dgWs.onopen = () => {
      console.log('[STT-PROXY] Deepgram WebSocket OPEN');
      for (const buf of pending) {
        dgWs.send(buf);
      }
      pending.length = 0;
    };

    dgWs.onmessage = (e) => {
      const preview = typeof e.data === 'string' ? e.data.substring(0, 120) : '(binary)';
      console.log('[STT-PROXY] DG message:', preview);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(e.data);
      }
    };

    dgWs.onerror = (err) => {
      console.error('[STT-PROXY] Deepgram WS error:', (err as any)?.message || 'unknown');
      clientSocket.close(1011, 'Deepgram connection failed');
    };

    dgWs.onclose = (ev) => {
      console.log('[STT-PROXY] Deepgram WS CLOSED code:', ev.code, 'reason:', ev.reason);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(ev.code || 1000, String(ev.reason || ''));
      }
    };

    clientSocket.onopen = () => {
      console.log('[STT-PROXY] Client WebSocket OPEN');
      // If DG already connected, flush audio now
      if (dgWs.readyState === WebSocket.OPEN) {
        for (const buf of pending) {
          dgWs.send(buf);
        }
        pending.length = 0;
      }
    };

    clientSocket.onmessage = (e) => {
      if (dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(e.data);
      } else {
        pending.push(e.data);
      }
    };

    clientSocket.onclose = () => {
      console.log('[STT-PROXY] Client WS CLOSED');
      dgWs.close();
    };

    clientSocket.onerror = () => {
      console.log('[STT-PROXY] Client WS error');
      dgWs.close();
    };

    return response;
  }

  // ── HTTP GET: create a session id ──────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
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

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + 60_000 });

  return new Response(JSON.stringify({ session_id: sessionId }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
