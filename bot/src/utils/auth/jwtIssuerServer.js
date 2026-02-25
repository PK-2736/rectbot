const http = require('http');
const crypto = require('crypto');

const JWT_PRIVATE_KEY = (process.env.JWT_PRIVATE_KEY || '').trim();
const INTERNAL_SECRET = (process.env.INTERNAL_SECRET || '').trim();
const JWT_TTL_SEC = Number(process.env.JWT_USER_TTL_SEC || 3600);
const ISSUER_PORT = Number(process.env.JWT_ISSUER_PORT || 3002);
const ISSUER_HOST = process.env.JWT_ISSUER_HOST || '0.0.0.0';

function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function base64UrlFromBase64(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  const data = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const sig = signer.sign(privateKey, 'base64');
  return `${data}.${base64UrlFromBase64(sig)}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

async function handleIssueJwt(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!INTERNAL_SECRET) return sendJson(res, 503, { error: 'internal_secret_missing' });
  if (!JWT_PRIVATE_KEY) return sendJson(res, 503, { error: 'private_key_missing' });

  const provided = req.headers['x-internal-secret'] || '';
  if (provided !== INTERNAL_SECRET) return sendJson(res, 401, { error: 'unauthorized' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid_json', detail: err.message });
  }

  const userId = body.userId || body.user_id;
  const username = body.username || body.user_name || 'unknown';
  const role = body.role === 'admin' ? 'admin' : 'user';
  if (!userId) return sendJson(res, 400, { error: 'missing_user_id' });

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    userId: String(userId),
    username: String(username),
    role,
    iat: nowSec,
    exp: nowSec + Math.max(60, JWT_TTL_SEC)
  };

  const jwt = signJwt(payload, JWT_PRIVATE_KEY);
  return sendJson(res, 200, { jwt });
}

function requestHandler(req, res) {
  if (req.url === '/internal/jwt/issue') {
    return void handleIssueJwt(req, res);
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
}

function startJwtIssuerServer() {
  if (!JWT_PRIVATE_KEY || !INTERNAL_SECRET) {
    console.warn('[jwt-issuer] Disabled: JWT_PRIVATE_KEY or INTERNAL_SECRET missing.');
    return null;
  }

  const server = http.createServer(requestHandler);
  server.listen(ISSUER_PORT, ISSUER_HOST, () => {
    console.log(`[jwt-issuer] Listening on http://${ISSUER_HOST}:${ISSUER_PORT}`);
  });
  server.on('error', (err) => {
    console.error('[jwt-issuer] Server error:', err);
  });
  return server;
}

module.exports = { startJwtIssuerServer };
