import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';
import { WebSocket as WsWebSocket } from 'npm:ws@8.16.0';

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

    let dgWs: WsWebSocket | null = null;
    let dgStarted = false;
    const pending: ArrayBuffer[] = [];
    let clientMsgCount = 0;

    function sendStatus(status: Record<string, unknown>) {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ type: '_proxy_status', ...status }));
      }
    }

    function ensureDg() {
      if (dgStarted) return;
      dgStarted = true;
      console.log('[STT-PROXY] Creating DG WS via ws library with Auth header');
      dgWs = new WsWebSocket('wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&interim_results=true', {
        headers: { Authorization: `Token ${deepgramApiKey}` },
      });

      dgWs.on('open', () => {
        const n = pending.length;
        console.log('[STT-PROXY] DG OPEN, flushing', n, 'pending');
        sendStatus({ event: 'dg_open', pending: n });
        for (const buf of pending) {
          dgWs!.send(buf);
        }
        pending.length = 0;
      });

      dgWs.on('message', (data: Buffer) => {
        const msg = data.toString();
        console.log('[STT-PROXY] DG message rx, len:', msg.length, 'preview:', msg.substring(0, 100));
        sendStatus({ event: 'dg_message', len: msg.length, preview: msg.substring(0, 60) });
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(msg);
        }
      });

      dgWs.on('error', (err: Error) => {
        console.error('[STT-PROXY] DG error:', err.message);
        sendStatus({ event: 'dg_error', message: err.message });
        clientSocket.close(1011, 'Deepgram connection failed');
      });

      dgWs.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason ? reason.toString() : '';
        console.log('[STT-PROXY] DG CLOSED code:', code, 'reason:', reasonStr);
        sendStatus({ event: 'dg_close', code, reason: reasonStr });
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.close(code || 1000, reasonStr);
        }
      });
    }

    let clientMsgCount = 0;
    clientSocket.onmessage = (e) => {
      ensureDg();
      clientMsgCount++;
      const byteLen = typeof e.data === 'string' ? e.data.length : (e.data as ArrayBuffer).byteLength;
      if (dgWs && dgWs.readyState === WebSocket.OPEN) {
        console.log('[STT-PROXY] Fwd msg #' + clientMsgCount + ' size=' + byteLen);
        dgWs.send(e.data);
      } else {
        console.log('[STT-PROXY] Buffer msg #' + clientMsgCount + ' size=' + byteLen + ' dg_state=' + (dgWs?.readyState ?? -1));
        pending.push(e.data);
      }
    };

    clientSocket.onclose = () => {
      console.log('[STT-PROXY] Client CLOSED, msgs:', clientMsgCount, 'pending:', pending.length, 'dg_state:', dgWs?.readyState ?? -1);
      if (dgWs) dgWs.close();
    };

    clientSocket.onerror = () => {
      console.log('[STT-PROXY] Client error');
      if (dgWs) dgWs.close();
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
