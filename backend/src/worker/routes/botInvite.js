// routes/botInvite.js

export async function routeBotInvite(context) {
  const { request, url, corsHeaders } = context;
  console.log('[routeBotInvite] Called with pathname:', url.pathname, 'method:', request.method);
  
  // Bot invite API (returns reusable static OAuth URL)
  if ((url.pathname === '/api/bot-invite' || url.pathname === '/api/bot-invite/one-time') && request.method === 'POST') {
    console.log('[routeBotInvite /api/bot-invite] POST request received');
    try {
      const staticInviteUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
      return new Response(JSON.stringify({ ok: true, url: staticInviteUrl }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[routeBotInvite] Error:', e?.message || e);
      return new Response(JSON.stringify({ error: 'internal_error', detail: e?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Bot invite redirect for other paths
  if (url.pathname.startsWith('/api/bot-invite')) {
    const redirectUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
    return new Response(null, { status: 302, headers: { Location: redirectUrl, ...corsHeaders } });
  }

  // SERVICE_TOKEN authentication (disabled for now)

  return null;
}
