// routes/discord-auth.js - Discord OAuth callback handler
import { handleDiscordCallback } from '../worker/utils/discordOAuth.js';
import { verifyJWT } from '../worker/utils/auth.js';
import { getSupabaseClient } from '../worker/supabase.js';

function decodeOAuthState(rawState) {
  if (!rawState) return null;
  try {
    const normalized = String(rawState).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (_error) {
    return null;
  }
}

function resolveRedirectPath(url) {
  const state = decodeOAuthState(url.searchParams.get('state'));
  const candidate = state?.returnTo || url.searchParams.get('returnTo') || '/subscription';
  const normalized = String(candidate || '/subscription').trim();

  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return '/subscription';
  }

  return normalized;
}

/**
 * Handles Discord OAuth callback: /api/discord/callback?code=XXX
 * Returns JWT cookie and redirects to frontend
 */
async function handleCallback(request, env, { safeHeaders }) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: safeHeaders });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
      status: 400,
      headers: { ...safeHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { jwt, _userInfo } = await handleDiscordCallback(code, env);
    const redirectPath = resolveRedirectPath(url);

    const frontendUrl = env.FRONTEND_URL || 'https://dash.recrubo.net';
    const redirectUrl = new URL(redirectPath, frontendUrl);
    redirectUrl.searchParams.set('login', 'success');
    const cookieOptions = [
      `jwt=${jwt}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Max-Age=604800'
    ].join('; ');

    return new Response(null, {
      status: 302,
      headers: {
        ...safeHeaders,
        'Location': redirectUrl.toString(),
        'Set-Cookie': cookieOptions
      }
    });
  } catch (error) {
    console.error('Discord OAuth callback error:', error);

    const frontendUrl = env.FRONTEND_URL || 'https://dash.recrubo.net';
    const redirectPath = resolveRedirectPath(url);
    const redirectUrl = new URL(redirectPath, frontendUrl);
    redirectUrl.searchParams.set('error', error.message || 'Authentication failed');
    return new Response(null, {
      status: 302,
      headers: {
        ...safeHeaders,
        'Location': redirectUrl.toString()
      }
    });
  }
}

/**
 * Returns Discord guilds where the authenticated user has MANAGE_GUILD or
 * ADMINISTRATOR permission. Requires discord_access_token in Supabase users table.
 */
async function handleGetGuilds(request, env, { safeHeaders }) {
  const jsonHeaders = { ...safeHeaders, 'Content-Type': 'application/json' };

  const cookies = request.headers.get('Cookie') || '';
  const jwtToken = cookies.split(';').map(e => e.trim()).find(e => e.startsWith('jwt='))?.slice(4);
  if (!jwtToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }

  let payload;
  try {
    payload = await verifyJWT(decodeURIComponent(jwtToken), env);
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: jsonHeaders });
  }
  if (!payload?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }

  let accessToken = null;
  try {
    const supabase = getSupabaseClient(env);
    const { data } = await supabase
      .from('users')
      .select('discord_access_token')
      .eq('user_id', payload.userId)
      .maybeSingle();
    accessToken = data?.discord_access_token || null;
  } catch (e) {
    console.error('[discord/guilds] Supabase error:', e);
  }

  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: 'NO_TOKEN', message: '再ログインが必要です' }),
      { status: 401, headers: jsonHeaders }
    );
  }

  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return new Response(
        JSON.stringify({ error: 'NO_TOKEN', message: 'Discordトークンの有効期限切れ、または権限不足です。再ログインしてください。' }),
        { status: 401, headers: jsonHeaders }
      );
    }

    if (res.status === 429) {
      return new Response(
        JSON.stringify({ error: 'RATE_LIMIT', message: 'Discord APIのレート制限中です。少し待って再試行してください。' }),
        { status: 429, headers: jsonHeaders }
      );
    }

    const detail = await res.text().catch(() => 'unknown');
    return new Response(
      JSON.stringify({ error: 'DISCORD_API_ERROR', message: `Discord APIエラー (${res.status})`, detail }),
      { status: 502, headers: jsonHeaders }
    );
  }

  const guilds = await res.json();

  const MANAGE_GUILD = 0x20;
  const ADMINISTRATOR = 0x8;
  const manageableGuilds = guilds
    .filter(g => g.owner || ((parseInt(g.permissions) & ADMINISTRATOR) !== 0) || ((parseInt(g.permissions) & MANAGE_GUILD) !== 0))
    .map(g => ({ id: g.id, name: g.name, icon: g.icon }));

  return new Response(JSON.stringify(manageableGuilds), { status: 200, headers: jsonHeaders });
}

/**
 * Routes Discord authentication requests
 */
export async function handleDiscordAuthRoutes(request, env, context) {
  const { url } = context;

  if (url.pathname === '/api/discord/callback') {
    return await handleCallback(request, env, context);
  }

  if (url.pathname === '/api/discord/guilds' && request.method === 'GET') {
    return await handleGetGuilds(request, env, context);
  }

  return null;
}
