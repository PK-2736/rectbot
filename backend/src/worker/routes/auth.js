// routes/auth.js
import { isValidDiscordAdmin, verifyJWT } from '../utils/auth.js';
import { resolveSupabaseRestUrl } from '../supabase.js';

export async function routeAuth(request, env, ctx, url, corsHeaders) {
  // GET /api/auth/me
  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized', message: 'No authentication cookie' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const jwtMatch = cookieHeader.match(/jwt=([^;]+)/);
    if (!jwtMatch) {
      return new Response(JSON.stringify({ error: 'Unauthorized', message: 'JWT cookie missing' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = jwtMatch[1];
    const payload = await verifyJWT(token, env);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ user: { id: payload.userId, username: payload.username, role: payload.role, exp: payload.exp } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // GET /api/debug/env (admin only)
  if (request.method === 'GET' && url.pathname === '/api/debug/env') {
    const cookieHeader = request.headers.get('Cookie');
    if (!await isValidDiscordAdmin(cookieHeader, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      envStatus: {
        DISCORD_CLIENT_ID: !!env.DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET: !!env.DISCORD_CLIENT_SECRET,
        DISCORD_REDIRECT_URI: !!env.DISCORD_REDIRECT_URI,
        JWT_SECRET: !!env.JWT_SECRET,
        ADMIN_DISCORD_ID: !!env.ADMIN_DISCORD_ID,
        SERVICE_TOKEN: !!env.SERVICE_TOKEN,
        TUNNEL_URL: !!env.TUNNEL_URL,
        VPS_EXPRESS_URL: !!env.VPS_EXPRESS_URL,
        SUPABASE_URL: !!resolveSupabaseRestUrl(env),
        SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY
      },
      tunnelUrlPreview: env.TUNNEL_URL || env.VPS_EXPRESS_URL ? (env.TUNNEL_URL || env.VPS_EXPRESS_URL).substring(0, 30) + '...' : 'not set'
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // GET /api/debug/env-lite (service token required is handled globally; here we just compute result)
  if (request.method === 'GET' && url.pathname === '/api/debug/env-lite') {
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
    for (const [name, val] of sources) { if (typeof val === 'string' && val.trim() !== '') { selectedSource = name; break; } }
    let host = null; if (resolvedUrl) { try { host = new URL(resolvedUrl).host; } catch {} }
    return new Response(JSON.stringify({ ok: true, supabase: { configured: !!resolvedUrl, source: selectedSource, host, preview: resolvedUrl ? (resolvedUrl.substring(0, 32) + '...') : null }, serviceRoleKeyConfigured: !!env.SUPABASE_SERVICE_ROLE_KEY, timestamp: new Date().toISOString() }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return null;
}
