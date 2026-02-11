// routes/admin.js
import { isValidDiscordAdmin } from '../utils/auth.js';
import { sendToSentry } from '../utils/sentry.js';

function respondJson(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function authorizeAdmin(request, env, corsHeaders) {
  const cookieHeader = request.headers.get('Cookie');
  if (!await isValidDiscordAdmin(cookieHeader, env)) {
    return respondJson({ error: 'Unauthorized', message: 'Discord authentication required' }, 401, corsHeaders);
  }
  return null;
}

async function fetchFromDurableObject(env, url) {
  const id = env.RECRUITS_DO.idFromName('global');
  const stub = env.RECRUITS_DO.get(id);
  const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
  const text = await resp.text();
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function resolveExpressApiUrl(env) {
  const tunnelUrl = env.TUNNEL_URL || env.VPS_EXPRESS_URL || '';
  if (!tunnelUrl) return null;
  return `${tunnelUrl.replace(/\/$/, '')}/api/recruitment/list`;
}

function parseExpressResponse(responseText) {
  try {
    return { data: JSON.parse(responseText) };
  } catch (_parseError) {
    if (responseText.includes('error code:') || responseText.includes('cloudflare')) {
      return { error: 'VPS Express unreachable', status: 503, details: responseText.substring(0, 200) };
    }
    return { error: 'Invalid response from VPS Express', status: 502, details: responseText.substring(0, 200) };
  }
}

async function fetchFromExpress(env, corsHeaders, apiUrl) {
  const serviceToken = env.SERVICE_TOKEN;
  if (!serviceToken) {
    return respondJson({ error: 'Internal server error', message: 'Service token not configured' }, 500, corsHeaders);
  }

  const resp = await fetch(apiUrl, { method: 'GET', headers: { 'x-service-token': serviceToken } });
  const responseText = await resp.text();
  const parsed = parseExpressResponse(responseText);
  if (parsed.error) {
    if (parsed.status === 503) {
      return respondJson({ error: parsed.error, message: 'Cloudflare Tunnel might be down', details: parsed.details }, 503, corsHeaders);
    }
    return respondJson({ error: parsed.error, details: parsed.details }, parsed.status || 502, corsHeaders);
  }

  return respondJson(parsed.data, resp.status, corsHeaders);
}

export async function routeAdmin(context) {
  const { request, env, ctx, url, corsHeaders } = context;
  if (request.method !== 'GET' || url.pathname !== '/api/recruitment/list') {
    return null;
  }

  const authResponse = await authorizeAdmin(request, env, corsHeaders);
  if (authResponse) return authResponse;

  try {
    const resp = await fetchFromDurableObject(env, url);
    return new Response(await resp.text(), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Admin list via DO failed:', e);
    try { await sendToSentry(env, e, { path: url.pathname }, ctx); } catch (_) {}
  }

  const apiUrl = resolveExpressApiUrl(env);
  if (!apiUrl) {
    return respondJson({ error: 'VPS Express unreachable', message: 'No tunnel URL configured' }, 503, corsHeaders);
  }

  try {
    return await fetchFromExpress(env, corsHeaders, apiUrl);
  } catch (error) {
    return respondJson({
      error: 'Internal server error',
      message: error.message,
      errorType: error.name,
      debugInfo: {
        tunnelUrl: env.TUNNEL_URL || env.VPS_EXPRESS_URL || 'not set',
        serviceTokenConfigured: !!env.SERVICE_TOKEN,
        timestamp: new Date().toISOString()
      }
    }, 500, corsHeaders);
  }
}
