import { verifyServiceJwtToken } from './jwt.js';

async function verifyServiceToken(request, env) {
  const tokens = [env.SERVICE_TOKEN, env.SERVICE_TOKEN_SECONDARY]
    .filter(Boolean)
    .map(token => String(token).trim())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  const auth = request.headers.get('authorization') || '';
  const xt = request.headers.get('x-service-token') || '';
  let token = '';
  if (xt) token = xt.trim();
  else if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
  return token && tokens.includes(token);
}

async function verifyServiceJwt(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;
  const result = await verifyServiceJwtToken(token, env);
  return result.ok === true;
}

async function verifyInternalAuth(request, env) {
  if (await verifyServiceJwt(request, env)) return true;
  return verifyServiceToken(request, env);
}

export { verifyServiceToken, verifyServiceJwt, verifyInternalAuth };
