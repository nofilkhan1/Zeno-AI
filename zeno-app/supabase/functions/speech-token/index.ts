import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');

Deno.serve(async (req) => {
  const isWebSocket = req.headers.get('upgrade')?.toLowerCase() === 'websocket';

  if (!isWebSocket) {
    return new Response('This endpoint only accepts WebSocket connections', { status: 400 });
  }

  // ── WebSocket: upgrade immediately, before any logic ─────
  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  let dgWs: WebSocket | null = null;
  let dgStarted = false;
  const pending: ArrayBuffer[] = [];
  let clientMsgCount = 0;

  function ensureDg() {
    if (dgStarted) return;
    dgStarted = true;
    if (!deepgramApiKey) {
      console.error('[STT-PROXY] DEEPGRAM_API_KEY not configured');
      clientSocket.close(1011, 'Server misconfigured');
      return;
    }
    console.log('[STT-PROXY] Creating DG WS');
    dgWs = new WebSocket('wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=300', ['token', deepgramApiKey]);

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

  // Validate JWT directly — no shared state needed
  clientSocket.onopen = async () => {
    if (!token) {
      console.log('[STT-PROXY] Missing token, closing');
      clientSocket.close(4001, 'Missing auth token');
      return;
    }
    if (!supabaseUrl || !supabaseServiceKey || !deepgramApiKey) {
      console.log('[STT-PROXY] Server misconfigured');
      clientSocket.close(1011, 'Server misconfigured');
      return;
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.log('[STT-PROXY] Invalid token, closing');
      clientSocket.close(4001, 'Invalid auth token');
      return;
    }
    console.log('[STT-PROXY] Auth validated, user:', user.id);
  };

  clientSocket.onmessage = (e) => {
    ensureDg();
    clientMsgCount++;
    if (dgWs && dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(e.data);
    } else {
      pending.push(e.data);
    }
  };

  clientSocket.onerror = () => {
    console.error('[STT-PROXY] Client error');
    if (dgWs) dgWs.close();
  };

  // Background keepalive — not awaited, so 101 response is immediate
  (async () => {
    await new Promise<void>((resolve) => {
      clientSocket.onclose = (e) => {
        console.log('[STT-PROXY] Client CLOSED code:', e.code, 'reason:', e.reason, 'msgs:', clientMsgCount);
        if (dgWs) dgWs.close();
        resolve();
      };
    });
  })();

  return response;
});
