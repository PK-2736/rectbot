/*
 Cloudflare Worker: dashboard-proxy

 Responsibilities:
 - Verify Supabase session (by calling /auth/v1/user with Bearer token or cookie)
 - If valid, proxy GET requests to upstream services (grafana, metabase) and inject configured auth header
 - Strip X-Frame-Options to allow embedding and copy content-type/cache-control

 Environment variables expected:
 - SUPABASE_URL
 - GRAFANA_URL
 - GRAFANA_AUTH_HEADER (optional)
 - METABASE_URL
 - METABASE_AUTH_HEADER (optional)

 Usage examples:
 iframe src="https://api.recrubo.net/proxy?target=grafana&path=/d/abcd"
 or
 fetch('https://api.recrubo.net/proxy?target=metabase&path=/public/dashboard')

 Note: cookie-based auth requires cookies to be set for `.recrubo.net` with SameSite=None; alternatively send Authorization: Bearer <access_token>.
*/

const TARGETS = {
  grafana: { urlEnv: 'GRAFANA_URL', authEnv: 'GRAFANA_AUTH_HEADER' },
  metabase: { urlEnv: 'METABASE_URL', authEnv: 'METABASE_AUTH_HEADER' },
  // add more targets as needed
};

function getEnv(name) {
  return GLOBAL_ENV && GLOBAL_ENV[name] ? GLOBAL_ENV[name] : process && process.env && process.env[name];
}

// For wrangler, use global binding; but fallback to process.env for local tests
const GLOBAL_ENV = typeof globalThis !== 'undefined' && globalThis.__ENV ? globalThis.__ENV : undefined;

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === '/' || url.pathname === '/ping') {
    return new Response('ok', { status: 200 });
  }

  if (url.pathname.startsWith('/proxy')) {
    return handleProxy(request, url);
  }

  return new Response('not found', { status: 404 });
}

async function handleProxy(request, url) {
  const params = url.searchParams;
  const target = params.get('target');
  if (!target || !TARGETS[target]) {
    return new Response(JSON.stringify({ error: 'invalid target' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  // Allow only GET for embedding
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }

  // extract token from Authorization header or cookies
  const token = extractToken(request);
  if (!token) {
    // redirect to login page on dash (you may change to 401)
  return Response.redirect('https://dash.recrubo.net/login', 302);
  }

  // verify token with Supabase
  const supabaseUrl = getEnv('SUPABASE_URL');
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: 'supabase not configured' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  const userOk = await verifySupabaseToken(supabaseUrl, token);
  if (!userOk) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  // build upstream URL
  const mapping = TARGETS[target];
  const base = getEnv(mapping.urlEnv);
  if (!base) {
    return new Response(JSON.stringify({ error: 'upstream not configured' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  let upstream = base.replace(/\/+$/, '');
  const path = params.get('path') || '';
  if (path) {
    upstream = upstream + '/' + path.replace(/^\/+/, '');
  }

  // forward request to upstream with injected auth header (if configured)
  const headers = {};
  headers['user-agent'] = request.headers.get('user-agent') || '';
  headers['accept'] = request.headers.get('accept') || '*/*';

  const authHeader = getEnv(mapping.authEnv);
  if (authHeader) headers['authorization'] = authHeader;

  try {
    const upstreamRes = await fetch(upstream, { method: 'GET', headers });
    // copy some headers and body
    const respHeaders = new Headers();
    const ct = upstreamRes.headers.get('content-type');
    if (ct) respHeaders.set('content-type', ct);
    const cache = upstreamRes.headers.get('cache-control');
    if (cache) respHeaders.set('cache-control', cache);

    // remove frame-blocking headers if present so embedding works
    // (this can be adjusted or omitted depending on security policy)
    // Note: rewriting CSP/frame-ancestors may be required for some services

    const buffer = await upstreamRes.arrayBuffer();
    return new Response(buffer, { status: upstreamRes.status, headers: respHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'bad gateway' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
}

function extractToken(request) {
  // 1. Authorization header
  const auth = request.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();

  // 2. cookies
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  // common Supabase cookie names may vary; try typical ones
  const cookies = Object.fromEntries(cookie.split(';').map(c => {
    const [k, ...v] = c.split('=');
    return [k.trim(), decodeURIComponent(v.join('='))];
  }));
  // supabase stores access token in different keys depending on client; try these
  return cookies['sb-access-token'] || cookies['supabase-auth-token'] || cookies['sb:token'] || null;
}

async function verifySupabaseToken(supabaseUrl, token) {
  try {
    const resp = await fetch(new URL('/auth/v1/user', supabaseUrl).toString(), { headers: { 'Authorization': `Bearer ${token}` } });
    return resp.ok;
  } catch (e) {
    return false;
  }
}
