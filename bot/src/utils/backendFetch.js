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

  const headers = Object.assign({}, opts.headers || {});
  const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
  // Debug: do not log token itself, only presence
  try { console.log('[backendFetch] service token present=', !!svc, 'url=', url.replace(/https?:\/\//, '')); } catch (e) {}
  if (svc) headers['Authorization'] = `Bearer ${svc}`;
  // If body looks like JSON string and no content-type provided, set it
  if (!headers['Content-Type'] && opts.body && typeof opts.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const init = Object.assign({}, opts, { headers });
  return fetch(url, init);
};
