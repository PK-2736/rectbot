// routes/botInvite.js

export async function routeBotInvite(request, env, ctx, url, corsHeaders) {
  console.log('[routeBotInvite] Called with pathname:', url.pathname, 'method:', request.method);

  // Bot invite flow disabled: always redirect to static OAuth URL
  if (url.pathname.startsWith('/api/bot-invite')) {
    const redirectUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
    return new Response(null, { status: 302, headers: { Location: redirectUrl, ...corsHeaders } });
  }

  /*
  // SERVICE_TOKEN 認証チェック（Bot API として安全に実行）
  const authHeader = request.headers.get('authorization') || '';
  const xServiceToken = request.headers.get('x-service-token') || '';
  const serviceToken = env.SERVICE_TOKEN || '';
  const requireAuth = !!serviceToken;
  const hasValidAuth = !serviceToken || (
    authHeader === `Bearer ${serviceToken}` || 
    xServiceToken === serviceToken
  );

  // Create one-time wrapper URL
  if (url.pathname === '/api/bot-invite/one-time' && request.method === 'POST') {
    ...
  }

  // Landing page (GET) - does NOT consume token
  const matchInvite = url.pathname.match(/^\/api\/bot-invite\/t\/([A-Za-z0-9_\-]+)$/);
  if (matchInvite && request.method === 'GET') {
    ...
  }

  // Confirm (POST) - consume and redirect
  const matchInviteGo = url.pathname.match(/^\/api\/bot-invite\/t\/([A-Za-z0-9_\-]+)\/go$/);
  if (matchInviteGo && request.method === 'POST') {
    ...
  }
  */

  return null;
}
