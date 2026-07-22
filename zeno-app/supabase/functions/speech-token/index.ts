import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');

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

    sessions.delete(sessionId);
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

    let dgWs: WebSocket | null = null;
    let dgStarted = false;
    const pending: ArrayBuffer[] = [];
    let clientMsgCount = 0;

    function ensureDg() {
      if (dgStarted) return;
      dgStarted = true;
      console.log('[STT-PROXY] Creating DG WS');
      dgWs = new WebSocket('wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&interim_results=true', ['token', deepgramApiKey!]);

      dgWs.onopen = () => {
        const n = pending.length;
        console.log('[STT-PROXY] DG OPEN, flushing', n);
        for (const buf of pending) {
          dgWs!.send(buf);
        }
        pending.length = 0;
      };

      dgWs.onmessage = (e) => {
        const msg = typeof e.data === 'string' ? e.data : '';
        if (msg && clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(msg);
        }
      };

      dgWs.onerror = () => {
        console.error('[STT-PROXY] DG error');
        clientSocket.close(1011, 'Deepgram connection failed');
      };

      dgWs.onclose = (ev) => {
        console.log('[STT-PROXY] DG CLOSED code:', ev.code, 'reason:', ev.reason);
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.close(ev.code || 1000, String(ev.reason || ''));
        }
      };
    }

    clientSocket.onmessage = (e) => {
      ensureDg();
      clientMsgCount++;
      if (dgWs && dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(e.data);
      } else {
        pending.push(e.data);
      }
    };

    // Keep the function alive until the WebSocket closes.
    // Without this, Supabase's runtime kills the process (EarlyDrop)
    // immediately after the handler returns, before Deepgram connects.
    await new Promise<void>((resolve) => {
      clientSocket.onclose = (e) => {
        console.log('[STT-PROXY] Client CLOSED code:', e.code, 'reason:', e.reason, 'msgs:', clientMsgCount);
        if (dgWs) dgWs.close();
        resolve();
      };
      clientSocket.onerror = () => {
        console.error('[STT-PROXY] Client error');
        if (dgWs) dgWs.close();
        resolve();
      };
    });

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
