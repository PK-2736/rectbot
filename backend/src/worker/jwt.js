const DEFAULT_ISS = 'backend-api';
const DEFAULT_SUB = 'discord-bot';
const DEFAULT_AUD = 'cloudflare-worker';
const DEFAULT_SCOPE = ['internal_api'];
const CLOCK_SKEW_SEC = 30;

function getJwtSecret(env) {
  return (env.SERVICE_JWT_SECRET || env.JWT_SECRET || '').trim();
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret) {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function getNowSec() {
  return Math.floor(Date.now() / 1000);
}

async function verifyJwt(token, secret, expectedClaims = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid_format' };
  const [headerB64, payloadB64, sigB64] = parts;

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const key = await importHmacKey(secret);
  const expectedSig = await crypto.subtle.sign('HMAC', key, data);
  const expectedSigBytes = new Uint8Array(expectedSig);
  const providedSigBytes = base64UrlDecode(sigB64);
  if (!timingSafeEqual(expectedSigBytes, providedSigBytes)) return { ok: false, reason: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch (_err) {
    return { ok: false, reason: 'bad_payload' };
  }

  const now = getNowSec();
  if (payload.exp && now > payload.exp + CLOCK_SKEW_SEC) return { ok: false, reason: 'expired' };
  if (payload.iat && payload.iat - CLOCK_SKEW_SEC > now) return { ok: false, reason: 'not_yet_valid' };

  if (expectedClaims.iss && payload.iss !== expectedClaims.iss) return { ok: false, reason: 'bad_iss' };
  if (expectedClaims.sub && payload.sub !== expectedClaims.sub) return { ok: false, reason: 'bad_sub' };
  if (expectedClaims.aud && payload.aud !== expectedClaims.aud) return { ok: false, reason: 'bad_aud' };
  if (expectedClaims.scope) {
    const scopes = Array.isArray(payload.scope) ? payload.scope : [];
    if (!expectedClaims.scope.every((s) => scopes.includes(s))) return { ok: false, reason: 'bad_scope' };
  }

  return { ok: true, payload };
}

async function verifyServiceJwtToken(token, env) {
  const secret = getJwtSecret(env);
  if (!secret) return { ok: false, reason: 'missing_secret' };
  return verifyJwt(token, secret, {
    iss: DEFAULT_ISS,
    sub: DEFAULT_SUB,
    aud: DEFAULT_AUD,
    scope: DEFAULT_SCOPE
  });
}

export { verifyServiceJwtToken };
