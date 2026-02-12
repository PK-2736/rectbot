// Recruitment, DO proxy, and Grafana-related routes
// Returns a Response if this router handled the request; otherwise returns null

function isGrafanaPath(pathname) {
  return (
    pathname === '/metrics' ||
    pathname === '/api/grafana/recruits' ||
    pathname === '/api/grafana/recruits/history' ||
    pathname === '/api/grafana/recruits/at'
  );
}

function isGrafanaListRequest(url, request) {
  const isListPath = url.pathname === '/api/grafana/recruits' || url.pathname === '/api/grafana/recruits/search';
  if (!isListPath) return false;
  return request.method === 'POST' || request.method === 'GET';
}

function parseGrafanaRange(body) {
  const range = body?.range || {};
  const toMs = range?.to ? Date.parse(range.to) : Date.now();
  const fromMs = range?.from ? Date.parse(range.from) : (toMs - 5 * 3600 * 1000);
  return { fromMs, toMs };
}

function isWithinRange(ts, range) {
  const t = ts ? Date.parse(ts) : NaN;
  return !Number.isNaN(t) && t >= range.fromMs && t <= range.toMs;
}

function shouldIncludeGrafanaRecruit(recruit, range) {
  const now = Date.now();
  const status = String(recruit.status || 'recruiting');
  const expMs = recruit.expiresAt ? Date.parse(recruit.expiresAt) : Infinity;
  const isActive = status === 'recruiting' && expMs > now;
  const isRecentlyClosed = status !== 'recruiting' && (recruit.closedAt ? isWithinRange(recruit.closedAt, range) : (expMs >= (range.toMs - 5 * 3600 * 1000)));
  return isActive || isRecentlyClosed || isWithinRange(recruit.createdAt, range);
}

function formatGrafanaRecruit(recruit) {
  return {
    id: recruit.recruitId || recruit.id,
    message_id: recruit.message_id || recruit.messageId || null,
    title: recruit.title,
    content: recruit.description || recruit.content || recruit.title || null,
    note: recruit.note || (recruit.metadata && recruit.metadata.note) || null,
    guild_id: recruit.guildId || recruit.guild_id || null,
    guild_name: recruit.guildName || recruit.guild_name || null,
    channel_id: recruit.channelId || recruit.channel_id || null,
    channel_name: recruit.channelName || recruit.channel_name || null,
    game: recruit.game,
    platform: recruit.platform,
    ownerId: recruit.ownerId,
    participants_count: recruit.participants?.length || recruit.currentParticipants || recruit.participants_count || 0,
    currentMembers: recruit.participants?.length || recruit.currentMembers || 0,
    maxMembers: recruit.maxMembers || 0,
    voice: recruit.voice,
    status: recruit.status,
    createdAt: recruit.createdAt,
    closedAt: recruit.closedAt || null,
    expiresAt: recruit.expiresAt,
    startTime: recruit.startTime,
    start_game_time: recruit.start_game_time || recruit.startGameTime || null
  };
}

function isRecruitStatusRequest(url) {
  return url.pathname === '/api/recruit-status';
}

function withJsonHeaders(corsHeaders) {
  return { ...corsHeaders, 'Content-Type': 'application/json' };
}

function getGrafanaToken(request) {
  return request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
}

function logGrafanaTokenCheck({ grafanaToken, providedToken, request, url }) {
  console.log('[Grafana API] Token check:', {
    hasEnvToken: !!grafanaToken,
    envTokenLength: grafanaToken?.length || 0,
    hasProvidedToken: !!providedToken,
    providedTokenLength: providedToken?.length || 0,
    method: request.method,
    path: url.pathname
  });
}

function logGrafanaRequestHeaders(request, url, hasToken) {
  try {
    const hdrs = {};
    for (const [k, v] of request.headers.entries()) hdrs[k] = v;
    console.log('[Grafana API] Request:', { method: request.method, path: url.pathname, hasToken });
  } catch (_err) {}
}

function validateGrafanaListAccess(env, request, url, corsHeaders) {
  const grafanaToken = env.GRAFANA_TOKEN;
  const providedToken = getGrafanaToken(request);

  logGrafanaTokenCheck({ grafanaToken, providedToken, request, url });

  if (grafanaToken) {
    if (!providedToken || providedToken !== grafanaToken) {
      console.warn('[Grafana API] Unauthorized access attempt', { grafanaToken: !!grafanaToken, providedToken: !!providedToken });
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: withJsonHeaders(corsHeaders) });
    }
    console.log('[Grafana API] Token validated successfully');
  } else {
    console.warn('[Grafana API] No GRAFANA_TOKEN env variable set - API is open to any request');
  }

  logGrafanaRequestHeaders(request, url, !!grafanaToken);
  return null;
}

function getServiceToken(env) {
  return env.SERVICE_TOKEN || '';
}

function extractServiceToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  const serviceTokenHeader = request.headers.get('x-service-token') || '';
  if (serviceTokenHeader) return serviceTokenHeader.trim();
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function isAuthorizedServiceRequest(request, serviceToken) {
  if (!serviceToken) return true;
  const token = extractServiceToken(request);
  return !!token && token === serviceToken;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function requireGrafanaAuth(env, request, corsHeaders, logContext) {
  const grafanaToken = env.GRAFANA_TOKEN;
  if (!grafanaToken) return null;
  const providedToken = getGrafanaToken(request);
  if (!providedToken || providedToken !== grafanaToken) {
    if (logContext) console.warn(logContext);
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: withJsonHeaders(corsHeaders) });
  }
  return null;
}

function getDoStub(env) {
  const id = env.RECRUITS_DO.idFromName('global');
  return env.RECRUITS_DO.get(id);
}

function buildGrafanaHistoryUrl(requestUrl, fromMs, toMs) {
  return new URL(`/api/recruits-history?from=${encodeURIComponent(new Date(fromMs).toISOString())}&to=${encodeURIComponent(new Date(toMs).toISOString())}`, requestUrl);
}

function buildGrafanaAtUrl(requestUrl, ts) {
  return new URL(`/api/recruits-at?ts=${encodeURIComponent(new Date(ts).toISOString())}`, requestUrl);
}

function createRecruitmentCache(env) {
  const { hasUpstash, post } = createUpstashClient(env);
  const ttlHours = Number(env.RECRUITS_TTL_HOURS || 8);
  const ttlSec = ttlHours * 3600;

  const getJson = async (key) => {
    if (!hasUpstash) return null;
    const res = await post(['GET', key]);
    return res?.result || null;
  };

  const setJson = async (key, obj, ttl = ttlSec) => {
    if (!hasUpstash) return;
    await post(['SET', key, JSON.stringify(obj), 'EX', String(ttl)]);
  };

  const delKey = async (key) => {
    if (!hasUpstash) return;
    await post(['DEL', key]);
  };

  return { hasUpstash, getJson, setJson, delKey, ttlSec };
}

function getRecruitmentIdFromPath(url) {
  const pathPrefix = url.pathname.startsWith('/api/recruitments/') ? '/api/recruitments/' : '/api/recruitment/';
  return url.pathname.split(pathPrefix)[1];
}

function buildDoRequest(url, path, method, body) {
  return new Request(new URL(path, url).toString(), { method, body });
}

function createUpstashClient(env) {
  const hasUpstash = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  const post = async (cmd) => {
    if (!hasUpstash) return null;
    try {
      const r = await fetch(env.UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cmd)
      });
      return r.ok ? r.json() : null;
    } catch {
      return null;
    }
  };
  return { hasUpstash, post };
}

async function fetchRecruitsFromDO({ request, env }) {
  const id = env.RECRUITS_DO.idFromName('global');
  const stub = env.RECRUITS_DO.get(id);
  const listReq = new Request(new URL('/api/recruits', request.url).toString(), {
    method: 'GET',
    headers: { 'content-type': 'application/json' }
  });
  const resp = await stub.fetch(listReq);
  const data = await resp.json();
  return data.items || [];
}

async function handleMetrics({ request, env, url, corsHeaders }) {
  if (url.pathname !== '/metrics' || request.method !== 'GET') return null;

  try {
    const items = await fetchRecruitsFromDO({ request, env });
    const now = Date.now();
    const activeRecruits = items.filter(r => {
      const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
      return exp > now && r.status === 'recruiting';
    });

    const metrics = [
      '# HELP recruits_total Total number of recruitment posts',
      '# TYPE recruits_total gauge',
      `recruits_total ${items.length}`,
      '# HELP recruits_active Active recruitment posts',
      '# TYPE recruits_active gauge',
      `recruits_active ${activeRecruits.length}`,
      '# HELP recruits_participants_total Total participants across all recruits',
      '# TYPE recruits_participants_total gauge',
      `recruits_participants_total ${items.reduce((sum, r) => sum + (r.participants?.length || 0), 0)}`
    ].join('\n');

    return new Response(metrics, {
      status: 200,
      headers: { 'content-type': 'text/plain; version=0.0.4', ...corsHeaders }
    });
  } catch (e) {
    console.error('[Metrics] Error:', e);
    return new Response('# Error generating metrics\n', {
      status: 500,
      headers: { 'content-type': 'text/plain; version=0.0.4', ...corsHeaders }
    });
  }
}

async function handleGrafanaList({ request, env, url, corsHeaders }) {
  if (!isGrafanaListRequest(url, request)) {
    return null;
  }

  try {
    const authResponse = validateGrafanaListAccess(env, request, url, corsHeaders);
    if (authResponse) return authResponse;

    const items = await fetchRecruitsFromDO({ request, env });
    console.log(`[Grafana API] Got ${items.length} items from DO`);

    const body = await readJsonBody(request);
    const range = parseGrafanaRange(body);
    const filtered = items.filter(r => shouldIncludeGrafanaRecruit(r, range));

    console.log(`[Grafana API] Filtered to ${filtered.length} items`);

    const formatted = filtered.map(formatGrafanaRecruit);

    console.log(`[Grafana API] Returning ${formatted.length} formatted items`);
    return new Response(JSON.stringify(formatted), { status: 200, headers: withJsonHeaders(corsHeaders) });
  } catch (e) {
    console.error('[Grafana API] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: withJsonHeaders(corsHeaders) });
  }
}

async function handleGrafanaHistory({ request, env, url, corsHeaders }) {
  if (url.pathname !== '/api/grafana/recruits/history' || request.method !== 'POST') return null;

  try {
    const authResponse = requireGrafanaAuth(env, request, corsHeaders, '[Grafana API] Unauthorized access attempt');
    if (authResponse) return authResponse;

    const body = await readJsonBody(request);
    const range = parseGrafanaRange(body);
    const stub = getDoStub(env);
    const target = buildGrafanaHistoryUrl(request.url, range.fromMs, range.toMs);
    const resp = await stub.fetch(new Request(target.toString(), { method: 'GET' }));
    const data = await resp.json();
    return new Response(JSON.stringify(data?.events || []), { status: 200, headers: withJsonHeaders(corsHeaders) });
  } catch (e) {
    console.error('[Grafana history] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: withJsonHeaders(corsHeaders) });
  }
}

async function handleGrafanaAt({ request, env, url, corsHeaders }) {
  if (url.pathname !== '/api/grafana/recruits/at' || request.method !== 'POST') return null;

  try {
    const authResponse = requireGrafanaAuth(env, request, corsHeaders, '[Grafana API] Unauthorized access attempt');
    if (authResponse) return authResponse;

    const body = await readJsonBody(request);
    const range = parseGrafanaRange(body);
    const stub = getDoStub(env);
    const target = buildGrafanaAtUrl(request.url, range.toMs);
    const resp = await stub.fetch(new Request(target.toString(), { method: 'GET' }));
    const data = await resp.json();
    return new Response(JSON.stringify(data?.items || []), { status: 200, headers: withJsonHeaders(corsHeaders) });
  } catch (e) {
    console.error('[Grafana at] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: withJsonHeaders(corsHeaders) });
  }
}

async function handleRecruitsProxy({ request, env, url, corsHeaders, sendToSentry, ctx, readDoOnlyForGrafana }) {
  if (!url.pathname.startsWith('/api/recruits')) return null;

  if (readDoOnlyForGrafana && !isGrafanaPath(url.pathname)) {
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: withJsonHeaders(corsHeaders) });
  }

  try {
    const stub = getDoStub(env);
    const resp = await stub.fetch(request);
    const text = await resp.text();
    const contentType = resp.headers.get('content-type') || 'application/json';
    return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': contentType } });
  } catch (e) {
    console.error('[RecruitsDO proxy] Error:', e);
    if (typeof sendToSentry === 'function') { try { await sendToSentry(env, e, { path: url.pathname }, ctx); } catch (_err) {} }
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: withJsonHeaders(corsHeaders) });
  }
}

async function handleActiveRecruits({ request, env, url, corsHeaders, sendToSentry, ctx }) {
  if (url.pathname !== '/api/active-recruits' || request.method !== 'GET') return null;

  try {
    const serviceToken = getServiceToken(env);
    if (!isAuthorizedServiceRequest(request, serviceToken)) {
      console.warn('[active-recruits] Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: withJsonHeaders(corsHeaders)
      });
    }

    const items = await fetchRecruitsFromDO({ request, env });
    console.log(`[active-recruits] Total items from DO: ${items.length}`);

    const now = Date.now();
    const activeRecruits = items.filter(r => {
      const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
      const isActive = exp > now && r.status === 'recruiting';
      if (!isActive) {
        console.log(`[active-recruits] Filtered out: ${r.recruitId || r.id} (exp=${new Date(exp).toISOString()}, status=${r.status})`);
      }
      return isActive;
    });

    console.log(`[active-recruits] Returning ${activeRecruits.length} active recruits`);
    if (activeRecruits.length > 0) {
      console.log('[active-recruits] Sample recruits:', activeRecruits.slice(0, 2).map(r => ({
        id: r.recruitId || r.id,
        title: r.title,
        startTime: r.startTime,
        startTimeNotified: r.startTimeNotified,
        status: r.status,
        expiresAt: r.expiresAt
      })));
    }
    return new Response(JSON.stringify(activeRecruits), { status: 200, headers: withJsonHeaders(corsHeaders) });
  } catch (e) {
    console.error('[active-recruits] Error:', e);
    if (typeof sendToSentry === 'function') {
      try { await sendToSentry(env, e, { path: url.pathname }, ctx); } catch (_err) {}
    }
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: withJsonHeaders(corsHeaders)
    });
  }
}

function extractRequestMetadata(request) {
  const userAgent = request.headers.get('user-agent') || '';
  const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  return { userAgent, clientIP };
}

function validateServiceToken(serviceToken, request, clientIP, userAgent, corsHeaders) {
  if (!serviceToken) {
    return new Response(JSON.stringify({ error: 'service_unavailable' }), { status: 503, headers: withJsonHeaders(corsHeaders) });
  }

  if (!isAuthorizedServiceRequest(request, serviceToken)) {
    console.warn(`[security] Unauthorized push attempt from IP: ${clientIP}, UA: ${userAgent}`);
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: withJsonHeaders(corsHeaders) });
  }
  
  return null;
}

function validateUserAgent(userAgent, clientIP, corsHeaders) {
  if (!userAgent.includes('node') && !userAgent.includes('discord')) {
    console.warn(`[security] Suspicious User-Agent from IP: ${clientIP}, UA: ${userAgent}`);
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: withJsonHeaders(corsHeaders) });
  }
  return null;
}

function validateRecruitmentData(data, corsHeaders) {
  if (!data.recruitId || !data.guildId) {
    return new Response(JSON.stringify({ error: 'invalid_data', detail: 'recruitId and guildId are required' }), { status: 400, headers: withJsonHeaders(corsHeaders) });
  }
  return null;
}

function sanitizeRecruitmentData(data) {
  return {
    recruitId: String(data.recruitId).slice(0, 50),
    guildId: String(data.guildId).slice(0, 20),
    channelId: String(data.channelId || '').slice(0, 20),
    message_id: String(data.message_id || '').slice(0, 20),
    status: String(data.status || 'recruiting').slice(0, 20),
    start_time: data.start_time || new Date().toISOString()
  };
}

async function handleRecruitmentPush({ request, env, url, corsHeaders }) {
  if (url.pathname !== '/api/recruitment/push' || request.method !== 'POST') return null;

  try {
    const serviceToken = getServiceToken(env);
    const { userAgent, clientIP } = extractRequestMetadata(request);

    const tokenValidation = validateServiceToken(serviceToken, request, clientIP, userAgent, corsHeaders);
    if (tokenValidation) return tokenValidation;

    const agentValidation = validateUserAgent(userAgent, clientIP, corsHeaders);
    if (agentValidation) return agentValidation;

    const data = await request.json();
    const dataValidation = validateRecruitmentData(data, corsHeaders);
    if (dataValidation) return dataValidation;

    const sanitizedData = sanitizeRecruitmentData(data);

    console.log(`[worker][recruitment-push] Authorized request from IP: ${clientIP}, recruitId: ${sanitizedData.recruitId}`);
    return new Response(JSON.stringify({ success: true, recruitId: sanitizedData.recruitId, guildId: sanitizedData.guildId, message: 'Data received successfully' }), { status: 200, headers: withJsonHeaders(corsHeaders) });
  } catch (err) {
    console.error('[worker][recruitment-push] Error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: withJsonHeaders(corsHeaders) });
  }
}

async function handleDashboardRecruitment({ request, env, url, corsHeaders, readDoOnlyForGrafana }) {
  if (url.pathname !== '/api/dashboard/recruitment' || request.method !== 'GET') return null;

  try {
    if (readDoOnlyForGrafana) {
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: withJsonHeaders(corsHeaders) });
    }
    const stub = getDoStub(env);
    const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
    const text = await resp.text();
    return new Response(text, { status: 200, headers: withJsonHeaders(corsHeaders) });
  } catch (error) {
    console.error('[GET] DO fetch error:', error);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: withJsonHeaders(corsHeaders) });
  }
}

async function handleRecruitmentCollection({ request, env, url, corsHeaders, readDoOnlyForGrafana }) {
  if (url.pathname !== '/api/recruitment' && url.pathname !== '/api/recruitments') return null;

  const { setJson, ttlSec } = createRecruitmentCache(env);

  if (request.method === 'POST') {
    try {
      const data = await request.json();
      const stub = getDoStub(env);
      const resp = await stub.fetch(buildDoRequest(url, '/api/recruits', 'POST', JSON.stringify(data)));
      const bodyText = await resp.text();
      let parsed; try { parsed = JSON.parse(bodyText); } catch { parsed = { ok: false, raw: bodyText }; }
      if (parsed?.ok && data?.recruitId) {
        await setJson(`recruit:${data.recruitId}`, { ...data, createdAt: new Date().toISOString() }, ttlSec);
      }
      return new Response(JSON.stringify(parsed), { status: resp.status || 201, headers: withJsonHeaders(corsHeaders) });
    } catch (error) {
      console.error('[POST]/api/recruitment error:', error);
      return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: withJsonHeaders(corsHeaders) });
    }
  }

  if (request.method === 'GET') {
    try {
      if (readDoOnlyForGrafana) {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: withJsonHeaders(corsHeaders) });
      }
      const stub = getDoStub(env);
      const resp = await stub.fetch(buildDoRequest(url, '/api/recruits', 'GET'));
      const text = await resp.text();
      return new Response(text, { status: 200, headers: withJsonHeaders(corsHeaders) });
    } catch (error) {
      console.error('[GET]/api/recruitment error:', error);
      return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: withJsonHeaders(corsHeaders) });
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
}

async function handleRecruitmentPatch({ request, env, url, corsHeaders }) {
  const isPatchPath = (url.pathname.startsWith('/api/recruitment/') || url.pathname.startsWith('/api/recruitments/')) && request.method === 'PATCH';
  if (!isPatchPath) return null;

  const messageId = getRecruitmentIdFromPath(url);
  if (!messageId) {
    return new Response(JSON.stringify({ error: 'Message ID required' }), { status: 400, headers: withJsonHeaders(corsHeaders) });
  }
  try {
    const updateData = await request.json();
    const stub = getDoStub(env);
    const resp = await stub.fetch(buildDoRequest(url, `/api/recruits/${encodeURIComponent(messageId)}`, 'PATCH', JSON.stringify(updateData)));
    const text = await resp.text();
    return new Response(text, { status: resp.status, headers: withJsonHeaders(corsHeaders) });
  } catch (error) {
    console.error('[PATCH] Error updating via DO:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { status: 500, headers: withJsonHeaders(corsHeaders) });
  }
}

async function handleRecruitmentItem({ request, env, url, corsHeaders, readDoOnlyForGrafana }) {
  const isRecruitmentPath = url.pathname.startsWith('/api/recruitment/') || url.pathname.startsWith('/api/recruitments/');
  if (!isRecruitmentPath || (request.method !== 'GET' && request.method !== 'DELETE')) return null;

  const rid = getRecruitmentIdFromPath(url);
  if (!rid) {
    return new Response(JSON.stringify({ error: 'Message ID required' }), { status: 400, headers: withJsonHeaders(corsHeaders) });
  }

  const { hasUpstash, getJson, delKey } = createRecruitmentCache(env);

  if (request.method === 'GET') {
    if (hasUpstash) {
      const cached = await getJson(`recruit:${rid}`);
      if (cached) {
        try { return new Response(cached, { status: 200, headers: withJsonHeaders(corsHeaders) }); } catch {}
      }
    }
    if (readDoOnlyForGrafana) {
      return new Response(JSON.stringify({ error: 'restricted', message: 'DO read disabled outside Grafana' }), { status: 403, headers: withJsonHeaders(corsHeaders) });
    }
    const stub = getDoStub(env);
    const resp = await stub.fetch(buildDoRequest(url, `/api/recruits/${encodeURIComponent(rid)}`, 'GET'));
    const text = await resp.text();
    return new Response(text, { status: resp.status, headers: withJsonHeaders(corsHeaders) });
  }

  const body = await request.text();
  const stub = getDoStub(env);
  const resp = await stub.fetch(buildDoRequest(url, `/api/recruits/${encodeURIComponent(rid)}`, 'DELETE', body));
  const text = await resp.text();
  if (hasUpstash) { await delKey(`recruit:${rid}`); }
  return new Response(text, { status: resp.status, headers: withJsonHeaders(corsHeaders) });
}

async function handleRecruitStatus({ request, url, corsHeaders }) {
  if (!isRecruitStatusRequest(url)) return null;

  if (request.method === 'POST') {
    try {
      const data = await request.json();
      const { serverId, channelId, messageId, startTime } = data;
      console.log('[recruit-status] POST:', { serverId, channelId, messageId, startTime });
      return new Response(JSON.stringify({ ok: true, message: 'Status recorded' }), {
        status: 200,
        headers: withJsonHeaders(corsHeaders)
      });
    } catch (e) {
      console.error('[recruit-status] POST error:', e);
      return new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 400,
        headers: withJsonHeaders(corsHeaders)
      });
    }
  }

  if (request.method === 'DELETE') {
    try {
      const serverId = url.searchParams.get('serverId');
      console.log('[recruit-status] DELETE:', { serverId });
      return new Response(JSON.stringify({ ok: true, message: 'Status cleared' }), {
        status: 200,
        headers: withJsonHeaders(corsHeaders)
      });
    } catch (e) {
      console.error('[recruit-status] DELETE error:', e);
      return new Response(JSON.stringify({ error: 'internal_error' }), {
        status: 500,
        headers: withJsonHeaders(corsHeaders)
      });
    }
  }

  return null;
}

export async function routeRecruitment(context) {
  const readDoOnlyForGrafana = String(context.env.RECRUITS_READ_DO_ONLY_FOR_GRAFANA || 'false').toLowerCase() === 'true';
  const handlerContext = { ...context, readDoOnlyForGrafana };

  const handlers = [
    handleMetrics,
    handleGrafanaList,
    handleGrafanaHistory,
    handleGrafanaAt,
    handleRecruitsProxy,
    handleActiveRecruits,
    handleRecruitmentPush,
    handleDashboardRecruitment,
    handleRecruitmentCollection,
    handleRecruitmentPatch,
    handleRecruitmentItem,
    handleRecruitStatus
  ];

  for (const handler of handlers) {
    const response = await handler(handlerContext);
    if (response) return response;
  }

  return null;
}
