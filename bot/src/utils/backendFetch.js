// backendFetch (Worker unified)
const API_BASE = process.env.WORKER_API_BASE_URL || process.env.PUBLIC_API_BASE_URL || 'https://api.rectbot.tech';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

async function backendFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const init = Object.assign({}, opts);
  const method = (init.method || 'GET').toUpperCase();

  init.headers = init.headers ? { ...init.headers } : {};
  if ((method === 'POST' || method === 'DELETE' || method === 'PATCH') && SERVICE_TOKEN && !init.headers.authorization) {
    init.headers.authorization = `Bearer ${SERVICE_TOKEN}`;
  }
  if (!init.headers['content-type']) init.headers['content-type'] = 'application/json; charset=utf-8';

  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const err = new Error(`Request failed ${res.status}`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
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