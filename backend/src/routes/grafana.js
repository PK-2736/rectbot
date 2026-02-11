import { jsonResponse } from '../worker/http.js';

function createGrafanaAuthContext(request, env, url) {
  const providedToken = request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
  return {
    grafanaToken: env.GRAFANA_TOKEN,
    providedToken,
    method: request.method,
    path: url.pathname
  };
}

function logGrafanaAuthStatus(prefix, authContext) {
  console.log(prefix, {
    hasEnvToken: !!authContext.grafanaToken,
    envTokenLength: authContext.grafanaToken?.length || 0,
    hasProvidedToken: !!authContext.providedToken,
    providedTokenLength: authContext.providedToken?.length || 0,
    method: authContext.method,
    path: authContext.path
  });
}

function ensureGrafanaAuthorized(authContext, safeHeaders, prefix) {
  if (prefix) {
    logGrafanaAuthStatus(prefix, authContext);
  }

  if (authContext.grafanaToken) {
    if (!authContext.providedToken || authContext.providedToken !== authContext.grafanaToken) {
      console.warn(`${prefix} Unauthorized access attempt`, { 
        grafanaToken: !!authContext.grafanaToken, 
        providedToken: !!authContext.providedToken 
      });
      return { ok: false, response: jsonResponse({ error: 'unauthorized' }, 401, safeHeaders) };
    }
    if (prefix) console.log(`${prefix} Token validated successfully`);
    return { ok: true };
  }

  if (prefix) console.warn(`${prefix} No GRAFANA_TOKEN env variable set - API is open to any request`);
  return { ok: true };
}

async function listItems(store) {
  if (store && store.forwardToDO) {
    const res = await store.forwardToDO('/api/recruits', 'GET');
    const data = await res.json();
    return data.items || [];
  }
  if (store) return await store.listAll();
  return [];
}

function formatGrafanaItem(r) {
  return {
    id: r.recruitId || r.id,
    title: r.title,
    game: r.game,
    platform: r.platform,
    ownerId: r.ownerId,
    participants_count: r.participants?.length || r.currentMembers?.length || 0,
    currentMembers: r.participants?.length || r.currentMembers?.length || 0,
    maxMembers: r.maxMembers || 0,
    voice: r.voice,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    startTime: r.startTime
  };
}

async function handleGrafanaList(request, env, { url, safeHeaders, store }) {
  const authContext = createGrafanaAuthContext(request, env, url);
  const auth = ensureGrafanaAuthorized(authContext, safeHeaders, '[Grafana API] Token check:');
  if (!auth.ok) return auth.response;

  const items = await listItems(store);
  console.log(`[Grafana API] Got ${items.length} items from DO`);

  const now = Date.now();
  const formatted = items.filter(r => {
    const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
    const status = String(r.status || 'recruiting');
    return (status === 'recruiting' && exp > now) || status !== 'recruiting';
  }).map(formatGrafanaItem);

  console.log(`[Grafana API] Returning ${formatted.length} formatted items`);
  return jsonResponse(formatted, 200, safeHeaders);
}

async function handleGrafanaAt(request, env, { url, safeHeaders, store }) {
  const authContext = createGrafanaAuthContext(request, env, url);
  const auth = ensureGrafanaAuthorized(authContext, safeHeaders, '[Grafana API /at] Token check:');
  if (!auth.ok) return auth.response;

  const items = await listItems(store);

  let body = {};
  try { body = await request.json(); } catch {}
  const toMs = body?.range?.to ? Date.parse(body.range.to) : Date.now();

  const snapshot = items.filter(r => {
    const expMs = r.expiresAt ? Date.parse(r.expiresAt) : Infinity;
    const createdMs = r.createdAt ? Date.parse(r.createdAt) : 0;
    return createdMs <= toMs && expMs > toMs;
  }).map(formatGrafanaItem);

  console.log(`[Grafana API /at] Returning ${snapshot.length} items`);
  return jsonResponse(snapshot, 200, safeHeaders);
}

async function handleGrafanaHistory(request, env, { url, safeHeaders, store }) {
  const authContext = createGrafanaAuthContext(request, env, url);
  const auth = ensureGrafanaAuthorized(authContext, safeHeaders, '[Grafana API /history] Token check:');
  if (!auth.ok) return auth.response;

  const items = await listItems(store);

  let body = {};
  try { body = await request.json(); } catch {}
  const range = body?.range || {};
  const toMs = range?.to ? Date.parse(range.to) : Date.now();
  const fromMs = range?.from ? Date.parse(range.from) : (toMs - 24 * 3600 * 1000);

  const withinRange = (ts) => {
    const t = ts ? Date.parse(ts) : NaN;
    return !Number.isNaN(t) && t >= fromMs && t <= toMs;
  };

  const history = items.filter(r => withinRange(r.createdAt) || withinRange(r.closedAt)).map(r => ({
    ...formatGrafanaItem(r),
    closedAt: r.closedAt || null
  }));

  console.log(`[Grafana API /history] Returning ${history.length} items`);
  return jsonResponse(history, 200, safeHeaders);
}

async function handleGrafanaRoutes(request, env, { url, safeHeaders, store }) {
  if ((url.pathname === '/api/grafana/recruits' || url.pathname === '/api/grafana/recruits/search') && (request.method === 'POST' || request.method === 'GET')) {
    try {
      return await handleGrafanaList(request, env, { url, safeHeaders, store });
    } catch (e) {
      console.error('[Grafana API] Error:', e);
      return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
    }
  }

  if (url.pathname === '/api/grafana/recruits/at' && (request.method === 'POST' || request.method === 'GET')) {
    try {
      return await handleGrafanaAt(request, env, { url, safeHeaders, store });
    } catch (e) {
      console.error('[Grafana API /at] Error:', e);
      return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
    }
  }

  if (url.pathname === '/api/grafana/recruits/history' && (request.method === 'POST' || request.method === 'GET')) {
    try {
      return await handleGrafanaHistory(request, env, { url, safeHeaders, store });
    } catch (e) {
      console.error('[Grafana API /history] Error:', e);
      return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
    }
  }

  return null;
}

export { handleGrafanaRoutes };
