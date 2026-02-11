import { jsonResponse } from '../worker/http.js';

async function handleBotInviteRoutes(_request, _env, { url, safeHeaders }) {
  if (url.pathname === '/api/bot-invite/one-time') {
    if (_request.method === 'POST') {
      console.log('[index.js] Bot invite one-time POST received');
      try {
        const staticInviteUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
        return jsonResponse({ ok: true, url: staticInviteUrl }, 201, safeHeaders);
      } catch (e) {
        console.error('[index.js] Error:', e?.message || e);
        return jsonResponse({ error: 'internal_error', detail: e?.message }, 500, safeHeaders);
      }
    }
  }

  if (url.pathname.startsWith('/api/bot-invite')) {
    const redirectUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
    return new Response(null, { status: 302, headers: { Location: redirectUrl, ...safeHeaders } });
  }

  return null;
}

export { handleBotInviteRoutes };
