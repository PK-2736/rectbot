// Worker unified API - minimal self-contained implementation
// - Uses Durable Object if bound (env.RECRUITS_DO), otherwise in-memory fallback (non-persistent)
// - CORS origins via CORS_ORIGINS env (comma separated)
// - Write ops require Authorization: Bearer <SERVICE_TOKEN>

function parseOrigins(env) {
  const raw = env.CORS_ORIGINS || 'https://rectbot.tech,https://www.rectbot.tech,https://recrubo.net,https://www.recrubo.net';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeadersFor(origin, env) {
  const allowed = parseOrigins(env);
  const allow = allowed.includes(origin) ? origin : allowed[0] || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-token',
    'Access-Control-Allow-Credentials': 'true'
  };
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

async function verifyServiceToken(request, env) {
  const svc = env.SERVICE_TOKEN || '';
  if (!svc) return false;
  const auth = request.headers.get('authorization') || '';
  const xt = request.headers.get('x-service-token') || '';
  let token = '';
  if (xt) token = xt.trim();
  else if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
  return token && token === svc;
}

// Minimal storage abstraction: prefer Durable Object if bound, else in-memory Map (non-persistent)
function createInMemoryStore() {
  const map = new Map();
  const list = [];
  return {
    async listAll() {
      return list.map(id => map.get(id));
    },
    async get(id) {
      return map.get(id) || null;
    },
    async create(payload) {
      const id = payload.recruitId || crypto.randomUUID();
      const now = Date.now();
      const item = {
        ...payload,
        recruitId: id,
        createdAt: now,
        expiresAt: payload.expiresAt || now + 8 * 3600 * 1000
      };
      map.set(id, item);
      if (!list.includes(id)) list.push(id);
      return item;
    },
    async join(id, userId) {
      const r = map.get(id);
      if (!r) return null;
      r.currentMembers = Array.isArray(r.currentMembers) ? r.currentMembers : [];
      if (!r.currentMembers.includes(userId)) {
        if (r.maxMembers && r.currentMembers.length >= r.maxMembers) {
          throw new Error('full');
        }
        r.currentMembers.push(userId);
        map.set(id, r);
      }
      return r;
    },
    async delete(id, requesterId) {
      const r = map.get(id);
      if (!r) return null;
      if (r.ownerId && requesterId && r.ownerId !== requesterId) {
        throw new Error('forbidden');
      }
      map.delete(id);
      const idx = list.indexOf(id);
      if (idx !== -1) list.splice(idx, 1);
      return true;
    }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeadersFor(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // health
    if (url.pathname === '/ping') {
      return jsonResponse({ ok: true, name: 'recrubo-api' }, 200, cors);
    }

    // storage selection
    let store;
    if (env.RECRUITS_DO && typeof env.RECRUITS_DO.get === 'function') {
      // If a DO binding exists, delegate to its id/stub; for now call the DO stub endpoints
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const forwardToDO = async (path, method = 'GET', body = null, headers = {}) => {
        const req = new Request(new URL(path, request.url).toString(), {
          method,
          headers: { 'content-type': 'application/json', ...headers },
          body: body ? JSON.stringify(body) : undefined
        });
        return stub.fetch(req);
      };
      store = { forwardToDO };
    } else {
      if (!globalThis.__RECRUIT_STORE) globalThis.__RECRUIT_STORE = createInMemoryStore();
      store = globalThis.__RECRUIT_STORE;
    }

    // Backwards compatibility redirects (legacy /api/recruitment -> /api/recruitments)
    if (url.pathname === '/api/recruitment' || url.pathname === '/api/recruitment/') {
      if (request.method === 'GET') {
        url.pathname = '/api/recruitments';
      } else if (request.method === 'POST') {
        url.pathname = '/api/recruitments';
      }
    }
    if (url.pathname.startsWith('/api/recruitment/')) {
      const id = url.pathname.split('/')[2];
      url.pathname = `/api/recruitments/${id}`;
    }

    // GET /api/recruitments
    if (url.pathname === '/api/recruitments' && request.method === 'GET') {
      try {
        if (store.forwardToDO) {
          const res = await store.forwardToDO('/list', 'GET');
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const items = await store.listAll();
          return jsonResponse({ ok: true, items }, 200, cors);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, cors);
      }
    }

    // POST /api/recruitments (create) - requires Service Token
    if (url.pathname === '/api/recruitments' && request.method === 'POST') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors);
      }
      try {
        const body = await request.json();
        if (store.forwardToDO) {
          const res = await store.forwardToDO('/create', 'POST', body, { authorization: request.headers.get('authorization') || ''});
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const item = await store.create(body);
          return jsonResponse({ ok: true, recruit: item }, 201, cors);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, cors);
      }
    }

    // GET /api/recruitments/:id
    if (url.pathname.startsWith('/api/recruitments/') && request.method === 'GET') {
      const id = url.pathname.split('/')[2];
      try {
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/get/${id}`, 'GET');
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const r = await store.get(id);
          if (!r) return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
          return jsonResponse({ ok: true, recruit: r }, 200, cors);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, cors);
      }
    }

    // POST /api/recruitments/:id/join
    if (url.pathname.match(/^\/api\/recruitments\/[^/]+\/join$/) && request.method === 'POST') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors);
      }
      const id = url.pathname.split('/')[2];
      try {
        const { userId } = await request.json();
        if (!userId) return jsonResponse({ ok: false, error: 'invalid_user' }, 400, cors);
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/join/${id}`, 'POST', { userId }, { authorization: request.headers.get('authorization') || '' });
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const updated = await store.join(id, userId);
          return jsonResponse({ ok: true, recruit: updated }, 200, cors);
        }
      } catch (err) {
        if (err.message === 'full') return jsonResponse({ ok: false, error: 'full' }, 409, cors);
        return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, cors);
      }
    }

    // DELETE /api/recruitments/:id
    if (url.pathname.match(/^\/api\/recruitments\/[^/]+$/) && request.method === 'DELETE') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors);
      }
      const id = url.pathname.split('/')[2];
      let requesterId = '';
      try {
        const body = await request.json().catch(() => ({}));
        requesterId = body.userId || '';
      } catch(e){}
      try {
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/delete/${id}`, 'DELETE', { userId: requesterId }, { authorization: request.headers.get('authorization') || ''});
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          await store.delete(id, requesterId);
          return jsonResponse({ ok: true, status: 'deleted' }, 200, cors);
        }
      } catch (err) {
        if (err.message === 'forbidden') return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
        return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, cors);
      }
    }

    // POST /api/cleanup (admin stub)
    if (url.pathname === '/api/cleanup' && request.method === 'POST') {
      // TODO: implement admin auth if needed
      return jsonResponse({ ok: true, cleaned: 0 }, 200, cors);
    }

    // fallback
    return new Response('Not Found', { status: 404, headers: cors });
  }
};
