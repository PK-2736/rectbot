// utils/auth.js

export function isAdmin(discordId, env) {
  const adminIds = (env.ADMIN_DISCORD_ID || '').split(',').map(id => id.trim()).filter(Boolean);
  return adminIds.includes(String(discordId));
}

function base64UrlDecodeToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson(str) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(str)));
}

function pemToArrayBuffer(pem, label) {
  const cleaned = pem
    .replace(`-----BEGIN ${label}-----`, '')
    .replace(`-----END ${label}-----`, '')
    .replace(/\s+/g, '');
  return base64UrlDecodeToBytes(cleaned.replace(/\+/g, '-').replace(/\//g, '_'));
}

async function importPublicKey(publicKeyPem) {
  const keyData = pemToArrayBuffer(publicKeyPem, 'PUBLIC KEY');
  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

function parseJwtParts(token) {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) {
    throw new Error('Invalid token format');
  }
  return { header, body, signature };
}

function decodeSignature(signature) {
  return Uint8Array.from(
    atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );
}

export async function verifyJWT(token, env) {
  try {
    const { header, body, signature } = parseJwtParts(token);
    const headerJson = base64UrlDecodeJson(header);
    if (headerJson?.alg !== 'RS256') throw new Error('Invalid algorithm');
    const payload = base64UrlDecodeJson(body);
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');

    if (!env.JWT_PUBLIC_KEY) throw new Error('JWT_PUBLIC_KEY is not configured');
    const encoder = new TextEncoder();
    const key = await importPublicKey(env.JWT_PUBLIC_KEY);
    const signatureBytes = decodeSignature(signature);
    const isValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, encoder.encode(`${header}.${body}`));
    if (!isValid) throw new Error('Invalid signature');
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

export async function isValidDiscordAdmin(cookieHeader, env) {
  if (!cookieHeader) return false;
  const jwtMatch = cookieHeader.match(/jwt=([^;]+)/);
  if (!jwtMatch) return false;
  const jwt = jwtMatch[1];
  const payload = await verifyJWT(jwt, env);
  if (!payload) return false;
  return payload.role === 'admin';
}
