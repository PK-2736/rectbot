// routes/auth.js
import { isValidDiscordAdmin, verifyJWT } from '../utils/auth.js';
import { resolveSupabaseRestUrl } from '../supabase.js';

function respondJson(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function getJwtFromCookie(cookieHeader) {
  const jwtMatch = cookieHeader?.match(/jwt=([^;]+)/);
  return jwtMatch ? jwtMatch[1] : null;
}

function buildEnvStatus(env) {
  return {
    DISCORD_CLIENT_ID: !!env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: !!env.DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI: !!env.DISCORD_REDIRECT_URI,
    JWT_PUBLIC_KEY: !!env.JWT_PUBLIC_KEY,
    JWT_PRIVATE_KEY: !!env.JWT_PRIVATE_KEY,
    SERVICE_JWT_PUBLIC_KEY: !!env.SERVICE_JWT_PUBLIC_KEY,
    ADMIN_DISCORD_ID: !!env.ADMIN_DISCORD_ID,
    SERVICE_TOKEN: !!env.SERVICE_TOKEN,
    TUNNEL_URL: !!env.TUNNEL_URL,
    VPS_EXPRESS_URL: !!env.VPS_EXPRESS_URL,
    SUPABASE_URL: !!resolveSupabaseRestUrl(env),
    SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function buildEnvLitePayload(env) {
  const sources = [
    ['SUPABASE_URL', env.SUPABASE_URL],
    ['SUPABASE_REST_URL', env.SUPABASE_REST_URL],
    ['PUBLIC_SUPABASE_URL', env.PUBLIC_SUPABASE_URL],
    ['NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL],
    ['VITE_SUPABASE_URL', env.VITE_SUPABASE_URL],
    ['SUPABASE_PROJECT_URL', env.SUPABASE_PROJECT_URL]
  ];
  if (env.SUPABASE_PROJECT_REF) {
    sources.push(['SUPABASE_PROJECT_REF', `https://${env.SUPABASE_PROJECT_REF}.supabase.co`]);
  }
  const resolvedUrl = resolveSupabaseRestUrl(env);
  let selectedSource = null;
  for (const [name, val] of sources) {
    if (typeof val === 'string' && val.trim() !== '') { selectedSource = name; break; }
  }
  let host = null;
  if (resolvedUrl) {
    try { host = new URL(resolvedUrl).host; } catch {}
  }

  return {
    ok: true,
    supabase: {
      configured: !!resolvedUrl,
      source: selectedSource,
      host,
      preview: resolvedUrl ? (resolvedUrl.substring(0, 32) + '...') : null
    },
    serviceRoleKeyConfigured: !!env.SUPABASE_SERVICE_ROLE_KEY,
    timestamp: new Date().toISOString()
  };
}

async function handleAuthMe(request, env, corsHeaders) {
  if (request.method !== 'GET') return null;

  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return respondJson({ error: 'Unauthorized', message: 'No authentication cookie' }, 401, corsHeaders);
  }

  const token = getJwtFromCookie(cookieHeader);
  if (!token) {
    return respondJson({ error: 'Unauthorized', message: 'JWT cookie missing' }, 401, corsHeaders);
  }

  const payload = await verifyJWT(token, env);
  if (!payload) {
    return respondJson({ error: 'Unauthorized', message: 'Invalid token' }, 401, corsHeaders);
  }

  return respondJson({ user: { id: payload.userId, username: payload.username, role: payload.role, exp: payload.exp } }, 200, corsHeaders);
}

async function handleDebugEnv(request, env, corsHeaders) {
  if (request.method !== 'GET') return null;

  const cookieHeader = request.headers.get('Cookie');
  if (!await isValidDiscordAdmin(cookieHeader, env)) {
    return respondJson({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  return respondJson({
    envStatus: buildEnvStatus(env),
    tunnelUrlPreview: env.TUNNEL_URL || env.VPS_EXPRESS_URL
      ? (env.TUNNEL_URL || env.VPS_EXPRESS_URL).substring(0, 30) + '...'
      : 'not set'
  }, 200, corsHeaders);
}

async function handleDebugEnvLite(request, env, corsHeaders) {
  if (request.method !== 'GET') return null;
  return respondJson(buildEnvLitePayload(env), 200, corsHeaders);
}

export async function routeAuth(context) {
  const { request, env, url, corsHeaders } = context;

  if (url.pathname === '/api/auth/me') {
    return await handleAuthMe(request, env, corsHeaders);
  }

  if (url.pathname === '/api/debug/env') {
    return await handleDebugEnv(request, env, corsHeaders);
  }

  if (url.pathname === '/api/debug/env-lite') {
    return await handleDebugEnvLite(request, env, corsHeaders);
  }

  return null;
}
