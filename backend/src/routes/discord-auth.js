// routes/discord-auth.js - Discord OAuth callback handler
import { handleDiscordCallback } from '../worker/utils/discordOAuth.js';

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
    const { jwt, userInfo } = await handleDiscordCallback(code, env);

    // Set JWT cookie and redirect to dashboard
    const frontendUrl = env.FRONTEND_URL || 'https://dash.recrubo.net';
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
        'Location': `${frontendUrl}/?login=success`,
        'Set-Cookie': cookieOptions
      }
    });
  } catch (error) {
    console.error('Discord OAuth callback error:', error);
    
    const frontendUrl = env.FRONTEND_URL || 'https://dash.recrubo.net';
    return new Response(null, {
      status: 302,
      headers: {
        ...safeHeaders,
        'Location': `${frontendUrl}/?error=${encodeURIComponent(error.message || 'Authentication failed')}`
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
