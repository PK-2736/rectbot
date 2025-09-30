// backendFetch: attach SERVICE_TOKEN / BACKEND_SERVICE_TOKEN automatically
const config = require('../config');

module.exports = function backendFetch(pathOrUrl, opts = {}) {
  let url = String(pathOrUrl || '');
  // If a relative path was provided, prefix with BACKEND_API_URL from config
  if (!/^https?:\/\//i.test(url)) {
    if (!config.BACKEND_API_URL) {
      throw new Error('backendFetch: BACKEND_API_URL not configured and relative path used: ' + url);
    }
    url = config.BACKEND_API_URL.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url);
  }

  // Normalize provided headers to a case-insensitive map
  const providedHeaders = opts.headers || {};
  const normalized = {};
  Object.keys(providedHeaders).forEach((k) => {
    normalized[k.toLowerCase()] = providedHeaders[k];
  });

  const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
  // Debug: do not log token itself, only presence
  try { console.log('[backendFetch] service token present=', !!svc, 'url=', url.replace(/https?:\/\//, '')); } catch (e) {}

  // Only set Authorization if caller did not provide one (case-insensitive)
  if (svc && !Object.prototype.hasOwnProperty.call(normalized, 'authorization')) {
    normalized['authorization'] = `Bearer ${svc}`;
  }

  // If body looks like JSON string and no content-type provided, set it
  if (!Object.prototype.hasOwnProperty.call(normalized, 'content-type') && opts.body && typeof opts.body === 'string') {
    normalized['content-type'] = 'application/json';
  }

  // Rebuild headers object (lowercase keys are acceptable for fetch)
  const headers = Object.assign({}, normalized);

  const init = Object.assign({}, opts, { headers });
  return fetch(url, init);
};
