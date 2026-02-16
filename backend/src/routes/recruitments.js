import { jsonResponse } from '../worker/http.js';
import { verifyServiceJwt } from '../worker/auth.js';

function normalizeRecruitmentPath(pathname) {
  if (pathname === '/api/recruitment' || pathname === '/api/recruitment/') {
    return '/api/recruitments';
  }

  if (pathname.startsWith('/api/recruitment/')) {
    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts.length >= 3) {
      pathParts[1] = 'recruitments';
      return '/' + pathParts.join('/');
    }
  }

  return pathname;
}

async function forwardToDoOrExecute(store, doPath, method, body = null, headers = {}, localHandler = null) {
  if (store?.forwardToDO) {
    const res = await store.forwardToDO(doPath, method, body, headers);
    const text = await res.text();
    return { status: res.status, text };
  }
  if (localHandler) {
    return await localHandler();
  }
  throw new Error('No handler available');
}

async function requireAuth(request, env, safeHeaders) {
  if (!await verifyServiceJwt(request, env)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
  }
  return null;
}

async function listItems(store) {
  if (store?.forwardToDO) {
    const res = await store.forwardToDO('/api/recruits', 'GET');
    const data = await res.json();
    return data.items || [];
  }
  if (store) return await store.listAll();
  return [];
}

function buildJsonResponse(text, status, cors) {
  return new Response(text, { 
    status, 
    headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } 
  });
}

async function executeWithErrorHandling(context, handler) {
  try {
    const result = await handler();
    return buildJsonResponse(result.text, result.status, context.cors);
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, context.safeHeaders);
  }
}

async function handleListRecruits(store, cors, safeHeaders) {
  const context = { store, cors, safeHeaders };
  return executeWithErrorHandling(context, async () => {
    return await forwardToDoOrExecute(
      store,
      '/api/recruits',
      'GET',
      null,
      {},
      async () => ({ status: 200, text: JSON.stringify({ ok: true, items: await store.listAll() }) })
    );
  });
}

async function handleActiveRecruits(store, safeHeaders) {
  try {
    const items = await listItems(store);
    const now = Date.now();
    const active = items.filter(r => {
      const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
      return exp > now && r.status === 'recruiting';
    });
    return jsonResponse({ ok: true, body: active }, 200, safeHeaders);
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
  }
}

function buildAuthHeaders(request) {
  return { authorization: request.headers.get('authorization') || '' };
}

async function handleCreateRecruit(request, store, cors, safeHeaders) {
  console.log('[DEBUG] Matched POST /api/recruitments handler');
  const context = { store, cors, safeHeaders };
  return executeWithErrorHandling(context, async () => {
    const body = await request.json();
    return await forwardToDoOrExecute(
      store,
      '/api/recruits',
      'POST',
      body,
      buildAuthHeaders(request),
      async () => {
        const item = await store.create(body);
        return { status: 201, text: JSON.stringify({ ok: true, recruit: item }) };
      }
    );
  });
}

async function handleUpdateRecruit(request, store, id, cors, safeHeaders) {
  const context = { store, cors, safeHeaders };
  return executeWithErrorHandling(context, async () => {
    const update = await request.json();
    return await forwardToDoOrExecute(
      store,
      `/api/recruits/${id}`,
      'PATCH',
      update,
      buildAuthHeaders(request),
      async () => ({ status: 404, text: JSON.stringify({ ok: false, error: 'not_found' }) })
    );
  });
}

async function handleGetRecruitById(store, id, cors, safeHeaders) {
  const context = { store, cors, safeHeaders };
  return executeWithErrorHandling(context, async () => {
    return await forwardToDoOrExecute(
      store,
      `/api/recruits/${id}`,
      'GET',
      null,
      {},
      async () => {
        const r = await store.get(id);
        if (!r) return { status: 404, text: JSON.stringify({ ok: false, error: 'not_found' }) };
        return { status: 200, text: JSON.stringify({ ok: true, recruit: r }) };
      }
    );
  });
}

async function handleJoinRecruit(request, store, id, cors, safeHeaders) {
  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return jsonResponse({ ok: false, error: 'invalid_user' }, 400, safeHeaders);
  
  const context = { store, cors, safeHeaders };
  try {
    const result = await forwardToDoOrExecute(
      store,
      `/api/recruits/${id}/join`,
      'POST',
      { userId },
      buildAuthHeaders(request),
      async () => {
        const updated = await store.join(id, userId);
        return { status: 200, text: JSON.stringify({ ok: true, recruit: updated }) };
      }
    );
    return buildJsonResponse(result.text, result.status, cors);
  } catch (err) {
    if (err.message === 'full') return jsonResponse({ ok: false, error: 'full' }, 409, safeHeaders);
    return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
  }
}

async function extractRequesterId(request) {
  try {
    const body = await request.json().catch(() => ({}));
    return body.userId || '';
  } catch (_e) {
    return '';
  }
}

async function handleDeleteRecruit(request, store, id, cors, safeHeaders) {
  const requesterId = await extractRequesterId(request);
  
  try {
    const result = await forwardToDoOrExecute(
      store,
      `/api/recruits/${id}`,
      'DELETE',
      { userId: requesterId },
      buildAuthHeaders(request),
      async () => {
        await store.delete(id, requesterId);
        return { status: 200, text: JSON.stringify({ ok: true, status: 'deleted' }) };
      }
    );
    return buildJsonResponse(result.text, result.status, cors);
  } catch (err) {
    if (err.message === 'forbidden') return jsonResponse({ ok: false, error: 'forbidden' }, 403, safeHeaders);
    return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
  }
}

function logRecruitmentDebug(url, request, store) {
  if (url.pathname.includes('recruitment')) {
    console.log(`[DEBUG] ${request.method} ${url.pathname} (original: ${new URL(request.url).pathname})`);
    console.log('[DEBUG] store available:', !!store, 'store.forwardToDO:', !!store?.forwardToDO);
  }
}

function prepareNormalizedPath(url) {
  const normalizedPath = normalizeRecruitmentPath(url.pathname);
  if (normalizedPath !== url.pathname) {
    console.log('[DEBUG] Normalizing singular to plural:', url.pathname, '->', normalizedPath);
  }
  return normalizedPath;
}

async function routeGetRequests(context) {
  const { path, request, env, store, cors, safeHeaders } = context;
  if (path === '/api/recruitments' || path === '/api/active-recruits' || path.startsWith('/api/recruitments/')) {
    const authError = await requireAuth(request, env, safeHeaders);
    if (authError) return authError;
  }
  if (path === '/api/recruitments') {
    return handleListRecruits(store, cors, safeHeaders);
  }
  if (path === '/api/active-recruits') {
    return handleActiveRecruits(store, safeHeaders);
  }
  if (path.startsWith('/api/recruitments/')) {
    const id = path.split('/')[3];
    return handleGetRecruitById(store, id, cors, safeHeaders);
  }
  return null;
}

async function routePostRequests(context) {
  const { path, request, env, store, cors, safeHeaders } = context;
  if (path === '/api/recruitments') {
    const authError = await requireAuth(request, env, safeHeaders);
    if (authError) return authError;
    return handleCreateRecruit(request, store, cors, safeHeaders);
  }
  if (path.match(/^\/api\/recruitments\/[^/]+\/join$/)) {
    const authError = await requireAuth(request, env, safeHeaders);
    if (authError) return authError;
    const id = path.split('/')[3];
    return handleJoinRecruit(request, store, id, cors, safeHeaders);
  }
  if (path === '/api/cleanup') {
    return jsonResponse({ ok: true, cleaned: 0 }, 200, safeHeaders);
  }
  return null;
}

async function routePatchRequests(context) {
  const { path, request, env, store, cors, safeHeaders } = context;
  if (path.match(/^\/api\/recruitments\/[^/]+$/)) {
    const authError = await requireAuth(request, env, safeHeaders);
    if (authError) return authError;
    const id = path.split('/')[3];
    return handleUpdateRecruit(request, store, id, cors, safeHeaders);
  }
  return null;
}

async function routeDeleteRequests(context) {
  const { path, request, env, store, cors, safeHeaders } = context;
  if (path.match(/^\/api\/recruitments\/[^/]+$/)) {
    const authError = await requireAuth(request, env, safeHeaders);
    if (authError) return authError;
    const id = path.split('/')[3];
    return handleDeleteRecruit(request, store, id, cors, safeHeaders);
  }
  return null;
}

async function handleRecruitmentRoutes(request, env, { url, safeHeaders, store, cors }) {
  logRecruitmentDebug(url, request, store);
  const path = prepareNormalizedPath(url);
  const context = { path, request, env, store, cors, safeHeaders };

  const method = request.method;
  if (method === 'GET') return await routeGetRequests(context);
  if (method === 'POST') return await routePostRequests(context);
  if (method === 'PATCH') return await routePatchRequests(context);
  if (method === 'DELETE') return await routeDeleteRequests(context);

  return null;
}

export { handleRecruitmentRoutes };
