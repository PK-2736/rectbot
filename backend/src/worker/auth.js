async function verifyServiceToken(request, env) {
  const svc = env.SERVICE_TOKEN || '';
  if (!svc) return false;
  const auth = request.headers.get('authorization') || '';
  const xt = request.headers.get('x-service-token') || '';
  let token = '';
  if (xt) token = xt.trim();
  else if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
  return token && token === svc;
}

export { verifyServiceToken };
