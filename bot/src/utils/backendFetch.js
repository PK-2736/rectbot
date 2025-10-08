// backendFetch: attach SERVICE_TOKEN / BACKEND_SERVICE_TOKEN automatically
const config = require('../config');

// Retry helper with exponential backoff
async function fetchWithRetry(url, init, maxRetries = 3, timeoutMs = 30000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const fetchInit = { ...init, signal: controller.signal };
      const response = await fetch(url, fetchInit);
      clearTimeout(timeoutId);
      
      // Retry on 522 (Connection Timed Out), 524 (A Timeout Occurred), or 503 (Service Unavailable)
      if ((response.status === 522 || response.status === 524 || response.status === 503) && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
        console.warn(`[backendFetch] Retry ${attempt + 1}/${maxRetries} after ${delay}ms due to status ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      // Handle timeout or network errors
      if (error.name === 'AbortError') {
        console.warn(`[backendFetch] Request timeout (${timeoutMs}ms) on attempt ${attempt + 1}/${maxRetries + 1}`);
      } else {
        console.warn(`[backendFetch] Network error on attempt ${attempt + 1}/${maxRetries + 1}:`, error.message);
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.warn(`[backendFetch] Retrying after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

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

  // Set x-service-token header for Worker API authentication (if not already provided)
  if (svc && !Object.prototype.hasOwnProperty.call(normalized, 'x-service-token')) {
    normalized['x-service-token'] = svc;
  }
  
  // Also set Authorization header for backward compatibility (if not already provided)
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
  
  // Extract retry and timeout options
  const maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : 3;
  const timeoutMs = opts.timeout !== undefined ? opts.timeout : 30000;
  
  return fetchWithRetry(url, init, maxRetries, timeoutMs);
};
