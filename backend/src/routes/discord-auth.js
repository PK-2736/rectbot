// routes/discord-auth.js - Discord OAuth callback handler
import { handleDiscordCallback } from '../worker/utils/discordOAuth.js';

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

    // Set JWT cookie and redirect to dashboard
    const frontendUrl = env.FRONTEND_URL || 'https://dash.recrubo.net';
    const redirectUrl = new URL(redirectPath, frontendUrl);
    redirectUrl.searchParams.set('login', 'success');
    const cookieOptions = [
      `jwt=${jwt}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Max-Age=604800' // 7 days
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
 * Routes Discord authentication requests
 * @param {Request} request 
 * @param {Object} env 
 * @param {Object} context - { url, safeHeaders }
 * @returns {Response|null}
 */
export async function handleDiscordAuthRoutes(request, env, context) {
  const { url } = context;

  if (url.pathname === '/api/discord/callback') {
    return await handleCallback(request, env, context);
  }

  return null;
}
