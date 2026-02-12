import { jsonResponse } from '../worker/http.js';
import { verifyServiceToken } from '../worker/auth.js';

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
  if (!await verifyServiceToken(request, env)) {
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

async function handleListRecruits(store, cors, safeHeaders) {
  try {
    const result = await forwardToDoOrExecute(
      store,
      '/api/recruits',
      'GET',
      null,
      {},
      async () => ({ status: 200, text: JSON.stringify({ ok: true, items: await store.listAll() }) })
    );
    return new Response(result.text, { status: result.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
  }
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

async function handleCreateRecruit(request, store, cors, safeHeaders) {
  console.log('[DEBUG] Matched POST /api/recruitments handler');
  try {
    const body = await request.json();
    const result = await forwardToDoOrExecute(
      store,
      '/api/recruits',
      'POST',
      body,
      { authorization: request.headers.get('authorization') || '' },
      async () => {
        const item = await store.create(body);
        return { status: 201, text: JSON.stringify({ ok: true, recruit: item }) };
      }
    );
    return new Response(result.text, { status: result.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
  }
}

async function handleUpdateRecruit(request, store, id, cors, safeHeaders) {
  try {
    const update = await request.json();
    const result = await forwardToDoOrExecute(
      store,
      `/api/recruits/${id}`,
      'PATCH',
      update,
      { authorization: request.headers.get('authorization') || '' },
      async () => ({ status: 404, text: JSON.stringify({ ok: false, error: 'not_found' }) })
    );
    return new Response(result.text, { status: result.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
  }
}

async function handleGetRecruitById(store, id, cors, safeHeaders) {
  try {
    const result = await forwardToDoOrExecute(
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
    return new Response(result.text, { status: result.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
  }
}

async function handleJoinRecruit(request, store, id, cors, safeHeaders) {
  try {
    const { userId } = await request.json();
    if (!userId) return jsonResponse({ ok: false, error: 'invalid_user' }, 400, safeHeaders);
    
    const result = await forwardToDoOrExecute(
      store,
      `/api/recruits/${id}/join`,
      'POST',
      { userId },
      { authorization: request.headers.get('authorization') || '' },
      async () => {
        const updated = await store.join(id, userId);
        return { status: 200, text: JSON.stringify({ ok: true, recruit: updated }) };
      }
    );
    return new Response(result.text, { status: result.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
  } catch (err) {
    if (err.message === 'full') return jsonResponse({ ok: false, error: 'full' }, 409, safeHeaders);
    return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
  }
}

async function handleDeleteRecruit(request, store, id, cors, safeHeaders) {
  let requesterId = '';
  try {
    const body = await request.json().catch(() => ({}));
    requesterId = body.userId || '';
  } catch (_e) {}
  
  try {
    const result = await forwardToDoOrExecute(
      store,
      `/api/recruits/${id}`,
      'DELETE',
      { userId: requesterId },
      { authorization: request.headers.get('authorization') || '' },
      async () => {
        await store.delete(id, requesterId);
        return { status: 200, text: JSON.stringify({ ok: true, status: 'deleted' }) };
      }
    );
    return new Response(result.text, { status: result.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
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

async function routeGetRequests(path, request, store, cors, safeHeaders) {
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

async function routePostRequests(path, request, env, store, cors, safeHeaders) {
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

async function routePatchRequests(path, request, env, store, cors, safeHeaders) {
  if (path.match(/^\/api\/recruitments\/[^/]+$/)) {
    const authError = await requireAuth(request, env, safeHeaders);
    if (authError) return authError;
    const id = path.split('/')[3];
    return handleUpdateRecruit(request, store, id, cors, safeHeaders);
  }
  return null;
}

async function routeDeleteRequests(path, request, env, store, cors, safeHeaders) {
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

  const method = request.method;
  if (method === 'GET') return await routeGetRequests(path, request, store, cors, safeHeaders);
  if (method === 'POST') return await routePostRequests(path, request, env, store, cors, safeHeaders);
  if (method === 'PATCH') return await routePatchRequests(path, request, env, store, cors, safeHeaders);
  if (method === 'DELETE') return await routeDeleteRequests(path, request, env, store, cors, safeHeaders);

  return null;
}

export { handleRecruitmentRoutes };
