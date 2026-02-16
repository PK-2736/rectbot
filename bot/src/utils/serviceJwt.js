const crypto = require('crypto');

const JWT_SECRET = (process.env.SERVICE_JWT_SECRET || process.env.JWT_SECRET || '').trim();
const JWT_TTL_SEC = Number(process.env.SERVICE_JWT_TTL_SEC || 600);

let cachedToken = null;
let cachedExpMs = 0;
let inflight = null;

function isTokenValid() {
  return cachedToken && Date.now() < cachedExpMs - 30 * 1000;
}

function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function fetchServiceJwt() {
  if (!JWT_SECRET) return null;
  if (isTokenValid()) return cachedToken;
  if (inflight) return inflight;

  inflight = (async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'backend-api',
      sub: 'discord-bot',
      aud: 'cloudflare-worker',
      iat: nowSec,
      exp: nowSec + JWT_TTL_SEC,
      scope: ['internal_api']
    };
    cachedToken = signJwt(payload, JWT_SECRET);
    cachedExpMs = payload.exp * 1000;
    return cachedToken;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

module.exports = { fetchServiceJwt };
