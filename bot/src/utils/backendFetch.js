// backendFetch (Worker unified)
const API_BASE = process.env.WORKER_API_BASE_URL || process.env.PUBLIC_API_BASE_URL || process.env.BACKEND_API_URL || 'https://api.recrubo.net';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
const { fetchServiceJwt } = require('./serviceJwt');

function buildRequestUrl(path) {
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}

function normalizeHeaders(headers) {
  return headers ? { ...headers } : {};
}

function hasHeader(headers, headerName) {
  return Object.keys(headers).some(key => key.toLowerCase() === headerName.toLowerCase());
}

function getHeaderValue(headers, headerName) {
  const key = Object.keys(headers).find(k => k.toLowerCase() === headerName.toLowerCase());
  return key ? headers[key] : undefined;
}

function deleteHeader(headers, headerName) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === headerName.toLowerCase()) {
      delete headers[key];
    }
  }
}

function isLegacyServiceTokenAuth(headers) {
  if (!SERVICE_TOKEN) return false;
  const auth = getHeaderValue(headers, 'authorization');
  if (!auth || typeof auth !== 'string') return false;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] === SERVICE_TOKEN : false;
}

async function ensureServiceHeaders(headers) {
  // Always drop legacy x-service-token headers.
  deleteHeader(headers, 'x-service-token');

  try {
    const jwt = await fetchServiceJwt();
    if (jwt) {
      headers.authorization = `Bearer ${jwt}`;
      return headers;
    }
  } catch (err) {
    console.warn('[backendFetch] Failed to fetch service JWT:', err?.message || err);
  }

  if (isLegacyServiceTokenAuth(headers)) {
    deleteHeader(headers, 'authorization');
    console.warn('[backendFetch] Dropped legacy SERVICE_TOKEN auth header (JWT required).');
  }

  return headers;
}

function ensureJsonContentType(headers) {
  if (!hasHeader(headers, 'content-type')) headers['content-type'] = 'application/json; charset=utf-8';
  return headers;
}

function logRequest(method, url, headers) {
  console.log(`[backendFetch] ${method} ${url}`);
  console.log(`[backendFetch] SERVICE_TOKEN present: ${!!SERVICE_TOKEN}, length: ${SERVICE_TOKEN ? SERVICE_TOKEN.length : 0}`);
  const safeHeaders = { ...headers };
  for (const key of Object.keys(safeHeaders)) {
    if (['authorization', 'x-service-token'].includes(key.toLowerCase())) {
      safeHeaders[key] = '[redacted]';
    }
  }
  console.log(`[backendFetch] Headers:`, JSON.stringify(safeHeaders, null, 2));
}

async function parseResponse(res) {
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { text, json };
}

function buildRequestError(res, body) {
  const err = new Error(`Request failed ${res.status}`);
  err.status = res.status;
  err.body = body;
  return err;
}

async function backendFetch(path, opts = {}) {
  const url = buildRequestUrl(path);
  const init = Object.assign({}, opts);
  const method = (init.method || 'GET').toUpperCase();

  init.headers = normalizeHeaders(init.headers);
  await ensureServiceHeaders(init.headers);
  ensureJsonContentType(init.headers);

  logRequest(method, url, init.headers);
  const res = await fetch(url, init);
  console.log(`[backendFetch] Response status: ${res.status}`);
  const { text, json } = await parseResponse(res);
  if (!res.ok) {
    console.error(`[backendFetch] Request failed ${res.status}: ${text}`);
    throw buildRequestError(res, json || text);
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