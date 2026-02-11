// routes/logs.js
export async function routeLogs(request, env, ctx, url, corsHeaders) {
  if (url.pathname === '/api/logs/cloudflare' && request.method === 'POST') {
    try {
      const SERVICE_TOKEN = env.SERVICE_TOKEN || '';
      if (!SERVICE_TOKEN) {
        return new Response(JSON.stringify({ error: 'service_unavailable' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const authHeader = request.headers.get('authorization') || '';
      const serviceTokenHeader = request.headers.get('x-service-token') || '';
      let token = '';
      if (serviceTokenHeader) token = serviceTokenHeader.trim();
      else if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) token = authHeader.slice(7).trim();

      if (!token || token !== SERVICE_TOKEN) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let payload = null;
      try { payload = await request.json(); } catch (_e) { payload = null; }

      const LOKI_PUSH_URL = env.LOKI_PUSH_URL || '';
      const LOKI_TENANT = env.LOKI_TENANT || '';
      const LOKI_AUTH_HEADER = env.LOKI_AUTH_HEADER || '';
      if (!LOKI_PUSH_URL) {
        return new Response(JSON.stringify({ ok: false, error: 'loki_not_configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const entries = [];
      if (payload === null) {
        const text = await request.text();
        if (text && text.trim()) entries.push({ message: text.trim() });
      } else if (Array.isArray(payload)) {
        for (const item of payload) entries.push(item);
      } else if (payload.logs && Array.isArray(payload.logs)) {
        for (const item of payload.logs) entries.push(item);
      } else if (payload.message || payload.msg) {
        entries.push({ message: payload.message || payload.msg, labels: payload.labels || payload.meta });
      } else {
        entries.push({ message: JSON.stringify(payload) });
      }

      const streams = [];
      const nowNs = String(Date.now() * 1000000);
      const values = entries.map(e => {
        const tsNs = e.ts ? String(Number(e.ts) * 1000000) : nowNs;
        const msg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
        return [tsNs, String(msg)];
      });

      const baseLabels = (payload && payload.labels && typeof payload.labels === 'object') ? payload.labels : {};
      const stream = { stream: { job: 'cloudflare-worker', ...baseLabels }, values };
      streams.push(stream);
      const lokiPush = { streams };

      const headers = { 'Content-Type': 'application/json' };
      if (LOKI_TENANT) headers['X-Scope-OrgID'] = LOKI_TENANT;
      if (LOKI_AUTH_HEADER) headers['Authorization'] = LOKI_AUTH_HEADER;

      const resp = await fetch(LOKI_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(lokiPush) });
      if (!resp.ok) {
        const text = await resp.text();
        return new Response(JSON.stringify({ ok: false, error: 'loki_push_failed', status: resp.status, detail: text }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ ok: true, forwarded: entries.length }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (_err) {
      return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  return null;
}
