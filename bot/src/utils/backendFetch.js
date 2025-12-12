// backendFetch (Worker unified)
const API_BASE = process.env.WORKER_API_BASE_URL || process.env.PUBLIC_API_BASE_URL || process.env.BACKEND_API_URL || 'https://api.recrubo.net';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

async function backendFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const init = Object.assign({}, opts);
  const method = (init.method || 'GET').toUpperCase();

  init.headers = init.headers ? { ...init.headers } : {};
  // Normalize header existence checks (case-insensitive) and set service token headers when needed.
  const hasAuthHeader = Object.keys(init.headers).some(k => k.toLowerCase() === 'authorization');
  const hasXServiceToken = Object.keys(init.headers).some(k => k.toLowerCase() === 'x-service-token');
  if (SERVICE_TOKEN) {
    if (!hasAuthHeader) init.headers.authorization = `Bearer ${SERVICE_TOKEN}`;
    if (!hasXServiceToken) init.headers['x-service-token'] = SERVICE_TOKEN;
  }
  if (!Object.keys(init.headers).some(k => k.toLowerCase() === 'content-type')) init.headers['content-type'] = 'application/json; charset=utf-8';

  console.log(`[backendFetch] ${method} ${url}`);
  console.log(`[backendFetch] SERVICE_TOKEN present: ${!!SERVICE_TOKEN}, length: ${SERVICE_TOKEN ? SERVICE_TOKEN.length : 0}`);
  console.log(`[backendFetch] Headers:`, JSON.stringify(init.headers, null, 2));
  const res = await fetch(url, init);
  console.log(`[backendFetch] Response status: ${res.status}`);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    console.error(`[backendFetch] Request failed ${res.status}: ${text}`);
    const err = new Error(`Request failed ${res.status}`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  console.log(`[backendFetch] Response:`, json);
  return json;
}

backendFetch.api = {
  listRecruits: () => backendFetch('/api/recruitments', { method: 'GET' }),
  createRecruit: (payload) => backendFetch('/api/recruitments', { method: 'POST', body: JSON.stringify(payload) }),
  getRecruit: (id) => backendFetch(`/api/recruitments/${id}`, { method: 'GET' }),
  joinRecruit: (id, userId) => backendFetch(`/api/recruitments/${id}/join`, { method: 'POST', body: JSON.stringify({ userId }) }),
  deleteRecruit: (id, requesterId) => backendFetch(`/api/recruitments/${id}`, { method: 'DELETE', body: JSON.stringify({ userId: requesterId }) })
};

module.exports = backendFetch;