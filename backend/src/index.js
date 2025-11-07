// Worker unified API - minimal self-contained implementation
// - Uses Durable Object if bound (env.RECRUITS_DO), otherwise in-memory fallback (non-persistent)
// - CORS origins via CORS_ORIGINS env (comma separated)
// - Write ops require Authorization: Bearer <SERVICE_TOKEN>

function parseOrigins(env) {
  const raw = env.CORS_ORIGINS || 'https://recrubo.net,https://www.recrubo.net,https://dash.recrubo.net,https://grafana.recrubo.net';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeadersFor(origin, env) {
  const allowed = parseOrigins(env);
  // セキュリティ: Access-Control-Allow-Credentials: true と * の併用は禁止
  // 許可されたOriginのみ明示的に返す。不明なOriginは拒否。
  if (!origin || !allowed.includes(origin)) {
    return null; // 不正なOriginの場合はnullを返す
  }
  return {
    'Access-Control-Allow-Origin': origin, // 必ず実際のOriginを返す（* は禁止）
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

    // セキュリティ: 不正なOriginからのOPTIONSリクエストは拒否
    if (request.method === 'OPTIONS') {
      if (!cors) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { status: 204, headers: cors });
    }
    
    // セキュリティ: 不正なOriginからの通常リクエストも拒否（GETは除く）
    if (!cors && request.method !== 'GET') {
      return new Response('Forbidden', { status: 403 });
    }
    
    // GETリクエストで不正なOriginの場合はCORSヘッダーなしで応答（後方互換性のため）
    const safeHeaders = cors || {};

    // health
    if (url.pathname === '/ping') {
      return jsonResponse({ ok: true, name: 'recrubo-api' }, 200, safeHeaders);
    }

    // storage selection (moved up before metrics endpoints)
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

    // Prometheus metrics endpoint for Grafana
    if (url.pathname === '/metrics' && request.method === 'GET') {
      try {
        let items = [];
        if (store && store.forwardToDO) {
          const res = await store.forwardToDO('/list', 'GET');
          const data = await res.json();
          items = data.items || [];
        } else if (store) {
          items = await store.listAll();
        }
        
        const now = Date.now();
        const activeRecruits = items.filter(r => {
          const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
          return exp > now && r.status === 'recruiting';
        });
        
        const metrics = [
          `# HELP recruits_total Total number of recruitment posts`,
          `# TYPE recruits_total gauge`,
          `recruits_total ${items.length}`,
          `# HELP recruits_active Active recruitment posts`,
          `# TYPE recruits_active gauge`,
          `recruits_active ${activeRecruits.length}`,
          `# HELP recruits_participants_total Total participants across all recruits`,
          `# TYPE recruits_participants_total gauge`,
          `recruits_participants_total ${items.reduce((sum, r) => sum + (r.currentMembers?.length || r.participants?.length || 0), 0)}`
        ].join('\n');
        
        return new Response(metrics, {
          status: 200,
          headers: { 'content-type': 'text/plain; version=0.0.4', ...cors }
        });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
      }
    }

    // JSON endpoint for Grafana JSON datasource plugin (public endpoint, no auth required)
    if (url.pathname === '/api/grafana/recruits' && request.method === 'POST') {
      try {
        let items = [];
        if (store && store.forwardToDO) {
          const res = await store.forwardToDO('/list', 'GET');
          const data = await res.json();
          items = data.items || [];
        } else if (store) {
          items = await store.listAll();
        }
        
        const now = Date.now();
        const activeRecruits = items.filter(r => {
          const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
          return exp > now && r.status === 'recruiting';
        });
        
        // Format for Grafana JSON datasource
        return jsonResponse(activeRecruits.map(r => ({
          id: r.recruitId || r.id,
          title: r.title,
          game: r.game,
          platform: r.platform,
          ownerId: r.ownerId,
          currentMembers: r.currentMembers?.length || r.participants?.length || 0,
          maxMembers: r.maxMembers || 0,
          voice: r.voice,
          status: r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          startTime: r.startTime
        })), 200, safeHeaders);
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
      }
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
          return jsonResponse({ ok: true, items }, 200, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // POST /api/recruitments (create) - requires Service Token
    if (url.pathname === '/api/recruitments' && request.method === 'POST') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      try {
        const body = await request.json();
        if (store.forwardToDO) {
          const res = await store.forwardToDO('/create', 'POST', body, { authorization: request.headers.get('authorization') || ''});
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const item = await store.create(body);
          return jsonResponse({ ok: true, recruit: item }, 201, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
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
          if (!r) return jsonResponse({ ok: false, error: 'not_found' }, 404, safeHeaders);
          return jsonResponse({ ok: true, recruit: r }, 200, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // POST /api/recruitments/:id/join
    if (url.pathname.match(/^\/api\/recruitments\/[^/]+\/join$/) && request.method === 'POST') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      const id = url.pathname.split('/')[2];
      try {
        const { userId } = await request.json();
        if (!userId) return jsonResponse({ ok: false, error: 'invalid_user' }, 400, safeHeaders);
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/join/${id}`, 'POST', { userId }, { authorization: request.headers.get('authorization') || '' });
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const updated = await store.join(id, userId);
          return jsonResponse({ ok: true, recruit: updated }, 200, safeHeaders);
        }
      } catch (err) {
        if (err.message === 'full') return jsonResponse({ ok: false, error: 'full' }, 409, safeHeaders);
        return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // DELETE /api/recruitments/:id
    if (url.pathname.match(/^\/api\/recruitments\/[^/]+$/) && request.method === 'DELETE') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
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
          return jsonResponse({ ok: true, status: 'deleted' }, 200, safeHeaders);
        }
      } catch (err) {
        if (err.message === 'forbidden') return jsonResponse({ ok: false, error: 'forbidden' }, 403, safeHeaders);
        return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // POST /api/cleanup (admin stub)
    if (url.pathname === '/api/cleanup' && request.method === 'POST') {
      // TODO: implement admin auth if needed
      return jsonResponse({ ok: true, cleaned: 0 }, 200, safeHeaders);
    }

    // fallback
    return new Response('Not Found', { status: 404, headers: safeHeaders });
  }
};
