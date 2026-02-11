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

async function listItems(store) {
  if (store && store.forwardToDO) {
    const res = await store.forwardToDO('/api/recruits', 'GET');
    const data = await res.json();
    return data.items || [];
  }
  if (store) return await store.listAll();
  return [];
}

async function handleRecruitmentRoutes(request, env, { url, safeHeaders, store, cors }) {
  if (url.pathname.includes('recruitment')) {
    console.log(`[DEBUG] ${request.method} ${url.pathname} (original: ${new URL(request.url).pathname})`);
    console.log('[DEBUG] store available:', !!store, 'store.forwardToDO:', !!store?.forwardToDO);
  }

  const normalizedPath = normalizeRecruitmentPath(url.pathname);
  if (normalizedPath !== url.pathname) {
    console.log('[DEBUG] Normalizing singular to plural:', url.pathname, '->', normalizedPath);
  }

  const path = normalizedPath;
  if (path !== url.pathname) {
    console.log('[DEBUG] After normalization:', path);
  }

  if (path === '/api/recruitments' && request.method === 'GET') {
    try {
      if (store.forwardToDO) {
        const res = await store.forwardToDO('/api/recruits', 'GET');
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
      }

      const items = await store.listAll();
      return jsonResponse({ ok: true, items }, 200, safeHeaders);
    } catch (e) {
      return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
    }
  }

  if (path === '/api/active-recruits' && request.method === 'GET') {
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

  if (path === '/api/recruitments' && request.method === 'POST') {
    console.log('[DEBUG] Matched POST /api/recruitments handler');
    if (!await verifyServiceToken(request, env)) {
      console.log('[DEBUG] Token verification failed');
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
    }
    console.log('[DEBUG] Token verified, proceeding with creation');

    try {
      const body = await request.json();
      if (store.forwardToDO) {
        const res = await store.forwardToDO('/api/recruits', 'POST', body, { authorization: request.headers.get('authorization') || '' });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
      }

      const item = await store.create(body);
      return jsonResponse({ ok: true, recruit: item }, 201, safeHeaders);
    } catch (e) {
      return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
    }
  }

  if (path.match(/^\/api\/recruitments\/[^/]+$/) && request.method === 'PATCH') {
    if (!await verifyServiceToken(request, env)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
    }
    const id = path.split('/')[3];
    try {
      const update = await request.json();
      if (store.forwardToDO) {
        const res = await store.forwardToDO(`/api/recruits/${id}`, 'PATCH', update, { authorization: request.headers.get('authorization') || '' });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
      }

      return jsonResponse({ ok: false, error: 'not_found' }, 404, safeHeaders);
    } catch (e) {
      return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
    }
  }

  if (path.startsWith('/api/recruitments/') && request.method === 'GET') {
    const id = path.split('/')[3];
    try {
      if (store.forwardToDO) {
        const res = await store.forwardToDO(`/api/recruits/${id}`, 'GET');
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
      }

      const r = await store.get(id);
      if (!r) return jsonResponse({ ok: false, error: 'not_found' }, 404, safeHeaders);
      return jsonResponse({ ok: true, recruit: r }, 200, safeHeaders);
    } catch (e) {
      return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
    }
  }

  if (path.match(/^\/api\/recruitments\/[^/]+\/join$/) && request.method === 'POST') {
    if (!await verifyServiceToken(request, env)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
    }
    const id = path.split('/')[3];
    try {
      const { userId } = await request.json();
      if (!userId) return jsonResponse({ ok: false, error: 'invalid_user' }, 400, safeHeaders);
      if (store.forwardToDO) {
        const res = await store.forwardToDO(`/api/recruits/${id}/join`, 'POST', { userId }, { authorization: request.headers.get('authorization') || '' });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
      }

      const updated = await store.join(id, userId);
      return jsonResponse({ ok: true, recruit: updated }, 200, safeHeaders);
    } catch (err) {
      if (err.message === 'full') return jsonResponse({ ok: false, error: 'full' }, 409, safeHeaders);
      return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
    }
  }

  if (path.match(/^\/api\/recruitments\/[^/]+$/) && request.method === 'DELETE') {
    if (!await verifyServiceToken(request, env)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
    }
    const id = path.split('/')[3];
    let requesterId = '';
    try {
      const body = await request.json().catch(() => ({}));
      requesterId = body.userId || '';
    } catch (_e) {}
    try {
      if (store.forwardToDO) {
        const res = await store.forwardToDO(`/api/recruits/${id}`, 'DELETE', { userId: requesterId }, { authorization: request.headers.get('authorization') || '' });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { ...(cors || {}), 'content-type': 'application/json; charset=utf-8' } });
      }

      await store.delete(id, requesterId);
      return jsonResponse({ ok: true, status: 'deleted' }, 200, safeHeaders);
    } catch (err) {
      if (err.message === 'forbidden') return jsonResponse({ ok: false, error: 'forbidden' }, 403, safeHeaders);
      return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
    }
  }

  if (path === '/api/cleanup' && request.method === 'POST') {
    return jsonResponse({ ok: true, cleaned: 0 }, 200, safeHeaders);
  }

  return null;
}

export { handleRecruitmentRoutes };
