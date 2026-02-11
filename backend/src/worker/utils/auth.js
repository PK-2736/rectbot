// utils/auth.js

export function isAdmin(discordId, env) {
  const adminIds = (env.ADMIN_DISCORD_ID || '').split(',').map(id => id.trim()).filter(Boolean);
  return adminIds.includes(String(discordId));
}

export async function issueJWT(userInfo, env) {
  const payload = {
    userId: userInfo.id,
    username: userInfo.username,
    role: isAdmin(userInfo.id, env) ? 'admin' : 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${header}.${body}.${signatureBase64}`;
}

function parseJwtParts(token) {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) {
    throw new Error('Invalid token format');
  }
  return { header, body, signature };
}

function decodeJwtPayload(body) {
  return JSON.parse(atob(body));
}

function decodeSignature(signature) {
  return Uint8Array.from(
    atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );
}

async function importJwtKey(secret) {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyJWT(token, env) {
  try {
    const { header, body, signature } = parseJwtParts(token);
    const payload = decodeJwtPayload(body);
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');

    const encoder = new TextEncoder();
    const key = await importJwtKey(env.JWT_SECRET);
    const signatureBytes = decodeSignature(signature);
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(`${header}.${body}`));
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
