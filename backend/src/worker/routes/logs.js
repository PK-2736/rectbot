// routes/logs.js
function respondJson(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function extractToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  const serviceTokenHeader = request.headers.get('x-service-token') || '';
  if (serviceTokenHeader) return serviceTokenHeader.trim();
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  return '';
}

async function readPayload(request) {
  try {
    return await request.json();
  } catch (_e) {
    return null;
  }
}

async function readPayloadWithRawText(request) {
  const payload = await readPayload(request);
  const rawText = payload === null ? await request.text() : '';
  return { payload, rawText };
}

function entryFromRawText(rawText) {
  const trimmed = rawText ? rawText.trim() : '';
  return trimmed ? [{ message: trimmed }] : [];
}

function entryFromMessage(payload) {
  return [{ message: payload.message || payload.msg, labels: payload.labels || payload.meta }];
}

function entryFromPayload(payload) {
  return [{ message: JSON.stringify(payload) }];
}

function normalizeEntries(payload, rawText) {
  const handlers = [
    { when: () => payload === null, build: () => entryFromRawText(rawText) },
    { when: () => Array.isArray(payload), build: () => payload },
    { when: () => payload?.logs && Array.isArray(payload.logs), build: () => payload.logs },
    { when: () => payload?.message || payload?.msg, build: () => entryFromMessage(payload) },
    { when: () => true, build: () => entryFromPayload(payload) }
  ];

  for (const handler of handlers) {
    if (handler.when()) {
      return handler.build();
    }
  }
  return [];
}

function buildLokiPayload(entries, payload) {
  const nowNs = String(Date.now() * 1000000);
  const values = entries.map(e => {
    const tsNs = e.ts ? String(Number(e.ts) * 1000000) : nowNs;
    const msg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
    return [tsNs, String(msg)];
  });

  const baseLabels = (payload && payload.labels && typeof payload.labels === 'object') ? payload.labels : {};
  return { streams: [{ stream: { job: 'cloudflare-worker', ...baseLabels }, values }] };
}

function buildLokiHeaders(env) {
  const headers = { 'Content-Type': 'application/json' };
  if (env.LOKI_TENANT) headers['X-Scope-OrgID'] = env.LOKI_TENANT;
  if (env.LOKI_AUTH_HEADER) headers['Authorization'] = env.LOKI_AUTH_HEADER;
  return headers;
}

function ensureServiceToken(env, corsHeaders) {
  const serviceToken = env.SERVICE_TOKEN || '';
  if (!serviceToken) {
    return { serviceToken: null, response: respondJson({ error: 'service_unavailable' }, 503, corsHeaders) };
  }
  return { serviceToken, response: null };
}

function validateServiceToken(request, serviceToken, corsHeaders) {
  const token = extractToken(request);
  if (!token || token !== serviceToken) {
    return respondJson({ error: 'unauthorized' }, 401, corsHeaders);
  }
  return null;
}

function ensureLokiConfigured(env, corsHeaders) {
  if (!env.LOKI_PUSH_URL) {
    return respondJson({ ok: false, error: 'loki_not_configured' }, 503, corsHeaders);
  }
  return null;
}

async function sendToLoki(env, payload, corsHeaders) {
  const headers = buildLokiHeaders(env);
  const resp = await fetch(env.LOKI_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!resp.ok) {
    const text = await resp.text();
    return respondJson({ ok: false, error: 'loki_push_failed', status: resp.status, detail: text }, 502, corsHeaders);
  }
  return null;
}

async function handleLogsRequest({ request, env, corsHeaders }) {
  const { serviceToken, response: tokenResponse } = ensureServiceToken(env, corsHeaders);
  if (tokenResponse) return tokenResponse;

  const authResponse = validateServiceToken(request, serviceToken, corsHeaders);
  if (authResponse) return authResponse;

  const { payload, rawText } = await readPayloadWithRawText(request);
  const lokiConfigured = ensureLokiConfigured(env, corsHeaders);
  if (lokiConfigured) return lokiConfigured;

  const entries = normalizeEntries(payload, rawText);
  const lokiPush = buildLokiPayload(entries, payload);
  const sendResponse = await sendToLoki(env, lokiPush, corsHeaders);
  if (sendResponse) return sendResponse;

  return respondJson({ ok: true, forwarded: entries.length }, 200, corsHeaders);
}

export async function routeLogs(context) {
  const { request, env, url, corsHeaders } = context;
  if (url.pathname !== '/api/logs/cloudflare' || request.method !== 'POST') {
    return null;
  }

  try {
    return await handleLogsRequest({ request, env, corsHeaders });
  } catch (_err) {
    return respondJson({ ok: false, error: 'internal_error' }, 500, corsHeaders);
  }
}
