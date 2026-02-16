const DEFAULT_ISS = 'backend-api';
const DEFAULT_SUB = 'discord-bot';
const DEFAULT_AUD = 'cloudflare-worker';
const DEFAULT_SCOPE = ['internal_api'];
const CLOCK_SKEW_SEC = 30;

function getJwtPublicKey(env) {
  return (env.SERVICE_JWT_PUBLIC_KEY || '').trim();
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson(str) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(str)));
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  return base64UrlDecode(b64.replace(/\+/g, '-').replace(/\//g, '_'));
}

async function importPublicKey(publicKeyPem) {
  const keyData = pemToArrayBuffer(publicKeyPem);
  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

function getNowSec() {
  return Math.floor(Date.now() / 1000);
}

async function verifyJwt(token, publicKeyPem, expectedClaims = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid_format' };
  const [headerB64, payloadB64, sigB64] = parts;

  let header;
  try {
    header = base64UrlDecodeJson(headerB64);
  } catch (_err) {
    return { ok: false, reason: 'bad_header' };
  }
  if (header?.alg !== 'RS256') return { ok: false, reason: 'bad_alg' };

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const providedSigBytes = base64UrlDecode(sigB64);
  const key = await importPublicKey(publicKeyPem);
  const isValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, providedSigBytes, data);
  if (!isValid) return { ok: false, reason: 'bad_signature' };

  let payload;
  try {
    payload = base64UrlDecodeJson(payloadB64);
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
  const publicKey = getJwtPublicKey(env);
  if (!publicKey) return { ok: false, reason: 'missing_public_key' };
  return verifyJwt(token, publicKey, {
    iss: DEFAULT_ISS,
    sub: DEFAULT_SUB,
    aud: DEFAULT_AUD,
    scope: DEFAULT_SCOPE
  });
}

export { verifyServiceJwtToken };
