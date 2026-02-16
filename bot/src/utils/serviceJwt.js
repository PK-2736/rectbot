const crypto = require('crypto');

const SERVICE_JWT_PRIVATE_KEY = (process.env.SERVICE_JWT_PRIVATE_KEY || '').trim();
const JWT_TTL_SEC = Number(process.env.SERVICE_JWT_TTL_SEC || 600);

let warnedMissingSecret = false;

let cachedToken = null;
let cachedExpMs = 0;
let inflight = null;

function isTokenValid() {
  return cachedToken && Date.now() < cachedExpMs - 30 * 1000;
}

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

async function fetchServiceJwt() {
  if (!SERVICE_JWT_PRIVATE_KEY) {
    if (!warnedMissingSecret) {
      console.warn('[serviceJwt] SERVICE_JWT_PRIVATE_KEY is not set; cannot sign JWT.');
      warnedMissingSecret = true;
    }
    return null;
  }
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
    cachedToken = signJwt(payload, SERVICE_JWT_PRIVATE_KEY);
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
