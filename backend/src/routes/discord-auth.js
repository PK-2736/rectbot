// routes/discord-auth.js - Discord OAuth callback handler
import { handleDiscordCallback } from '../worker/utils/discordOAuth.js';
import { verifyJWT } from '../worker/utils/auth.js';

async function createSupabaseAdminClient(env) {
  const url = env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key);
}

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
    const { jwt, _userInfo, accessToken, accessTokenExpiresIn } = await handleDiscordCallback(code, env);
    const redirectPath = resolveRedirectPath(url);

    const frontendUrl = env.FRONTEND_URL || 'https://dash.recrubo.net';
    const redirectUrl = new URL(redirectPath, frontendUrl);
    redirectUrl.searchParams.set('login', 'success');
    const jwtCookieOptions = [
      `jwt=${jwt}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Max-Age=604800'
    ].join('; ');

    const tokenMaxAge = Number.isFinite(Number(accessTokenExpiresIn)) && Number(accessTokenExpiresIn) > 0
      ? Math.floor(Number(accessTokenExpiresIn))
      : 604800;
    const discordTokenCookie = [
      `discord_at=${encodeURIComponent(accessToken || '')}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      `Max-Age=${tokenMaxAge}`
    ].join('; ');

    const headers = new Headers(safeHeaders);
    headers.set('Location', redirectUrl.toString());
    headers.append('Set-Cookie', jwtCookieOptions);
    headers.append('Set-Cookie', discordTokenCookie);

    return new Response(null, {
      status: 302,
      headers
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

  const discordTokenFromCookie = cookies
    .split(';')
    .map(e => e.trim())
    .find(e => e.startsWith('discord_at='))
    ?.slice('discord_at='.length);

  let accessToken = discordTokenFromCookie ? decodeURIComponent(discordTokenFromCookie) : null;
  if (!accessToken) {
    try {
      const supabase = await createSupabaseAdminClient(env);
      const { data } = await supabase
        .from('users')
        .select('discord_access_token')
        .eq('user_id', payload.userId)
        .maybeSingle();
      accessToken = data?.discord_access_token || null;
    } catch (e) {
      console.error('[discord/guilds] Supabase error:', e);
    }
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

  // サブスクリプション有効サーバーのみ返す
  if (manageableGuilds.length === 0) {
    return new Response(JSON.stringify([]), { status: 200, headers: jsonHeaders });
  }

  try {
    const supabase = await createSupabaseAdminClient(env);
    const guildIds = manageableGuilds.map((g) => g.id);

    const settingsQuery = await supabase
      .from('guild_settings')
      .select('guild_id, premium_enabled, premium_subscription_id')
      .in('guild_id', guildIds);

    const subscriptionsQuery = await supabase
      .from('subscriptions')
      .select('purchased_guild_id, status')
      .in('purchased_guild_id', guildIds)
      .in('status', ['active', 'trialing']);

    if (settingsQuery.error) {
      console.error('[discord/guilds] guild_settings premium filter error:', settingsQuery.error);
      return new Response(JSON.stringify({ error: 'FAILED_GUILD_FILTER', message: 'サブスク有効サーバーの取得に失敗しました' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    if (subscriptionsQuery.error) {
      console.error('[discord/guilds] subscriptions premium filter error:', subscriptionsQuery.error);
      return new Response(JSON.stringify({ error: 'FAILED_GUILD_FILTER', message: 'サブスク有効サーバーの取得に失敗しました' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const enabledGuildIdSet = new Set();
    for (const row of (settingsQuery.data || [])) {
      const guildId = String(row.guild_id || '').trim();
      if (!guildId) continue;
      if (row.premium_enabled === true || row.premium_subscription_id) {
        enabledGuildIdSet.add(guildId);
      }
    }

    for (const row of (subscriptionsQuery.data || [])) {
      const guildId = String(row.purchased_guild_id || '').trim();
      if (guildId) enabledGuildIdSet.add(guildId);
    }

    const premiumGuilds = manageableGuilds.filter((g) => enabledGuildIdSet.has(String(g.id)));
    return new Response(JSON.stringify(premiumGuilds), { status: 200, headers: jsonHeaders });
  } catch (e) {
    console.error('[discord/guilds] premium guild filtering failed:', e);
    return new Response(JSON.stringify({ error: 'FAILED_GUILD_FILTER', message: 'サブスク有効サーバーの取得に失敗しました' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
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
