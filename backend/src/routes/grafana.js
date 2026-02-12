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

// 参加者数を取得
function getParticipantCount(r) {
  return r.participants?.length || r.currentMembers?.length || 0;
}

// Grafana用にアイテムを整形
function formatGrafanaItem(r) {
  const participantCount = getParticipantCount(r);
  return {
    id: r.recruitId || r.id,
    title: r.title,
    game: r.game,
    platform: r.platform,
    ownerId: r.ownerId,
    participants_count: participantCount,
    currentMembers: participantCount,
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

// 時間範囲を解析
function parseTimeRange(body) {
  const range = body?.range || {};
  const toMs = range?.to ? Date.parse(range.to) : Date.now();
  const fromMs = range?.from ? Date.parse(range.from) : (toMs - 24 * 3600 * 1000);
  return { fromMs, toMs };
}

// タイムスタンプが範囲内かチェック
function isTimestampInRange(ts, fromMs, toMs) {
  const t = ts ? Date.parse(ts) : NaN;
  return !Number.isNaN(t) && t >= fromMs && t <= toMs;
}

// アイテムが履歴範囲内かチェック
function isItemInHistoryRange(r, fromMs, toMs) {
  return isTimestampInRange(r.createdAt, fromMs, toMs) || 
         isTimestampInRange(r.closedAt, fromMs, toMs);
}

// Grafana履歴取得ハンドラー
async function handleGrafanaHistory(request, env, { url, safeHeaders, store }) {
  const authContext = createGrafanaAuthContext(request, env, url);
  const auth = ensureGrafanaAuthorized(authContext, safeHeaders, '[Grafana API /history] Token check:');
  if (!auth.ok) return auth.response;

  const items = await listItems(store);

  let body = {};
  try { body = await request.json(); } catch {}
  const { fromMs, toMs } = parseTimeRange(body);

  const history = items
    .filter(r => isItemInHistoryRange(r, fromMs, toMs))
    .map(r => ({
      ...formatGrafanaItem(r),
      closedAt: r.closedAt || null
    }));

  console.log(`[Grafana API /history] Returning ${history.length} items`);
  return jsonResponse(history, 200, safeHeaders);
}

// メソッドがGETまたはPOSTかチェック
function isGetOrPost(method) {
  return method === 'GET' || method === 'POST';
}

// ルートとメソッドが一致するかチェック
function matchesRoute(url, method, ...pathnames) {
  return pathnames.includes(url.pathname) && isGetOrPost(method);
}

// エラーハンドリングされたハンドラーを実行
async function safeHandle(handler, options) {
  const { logPrefix, request, env, context, safeHeaders } = options;
  try {
    return await handler(request, env, context);
  } catch (e) {
    console.error(`${logPrefix} Error:`, e);
    return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
  }
}

// Grafanaルーティング
async function handleGrafanaRoutes(request, env, { url, safeHeaders, store }) {
  const { pathname } = url;
  const { method } = request;
  const context = { url, safeHeaders, store };

  if (matchesRoute(url, method, '/api/grafana/recruits', '/api/grafana/recruits/search')) {
    return safeHandle(handleGrafanaList, { 
      logPrefix: '[Grafana API]', 
      request, 
      env, 
      context, 
      safeHeaders 
    });
  }

  if (matchesRoute(url, method, '/api/grafana/recruits/at')) {
    return safeHandle(handleGrafanaAt, { 
      logPrefix: '[Grafana API /at]', 
      request, 
      env, 
      context, 
      safeHeaders 
    });
  }

  if (matchesRoute(url, method, '/api/grafana/recruits/history')) {
    return safeHandle(handleGrafanaHistory, { 
      logPrefix: '[Grafana API /history]', 
      request, 
      env, 
      context, 
      safeHeaders 
    });
  }

  return null;
}

export { handleGrafanaRoutes };
