// routes/admin.js
import { isValidDiscordAdmin } from '../utils/auth.js';
import { sendToSentry } from '../utils/sentry.js';

export async function routeAdmin(request, env, ctx, url, corsHeaders) {
  // Admin recruitment list (DO first, fallback to Express)
  if (request.method === 'GET' && url.pathname === '/api/recruitment/list') {
    const cookieHeader = request.headers.get('Cookie');
    if (!await isValidDiscordAdmin(cookieHeader, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Discord authentication required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
      const text = await resp.text();
      return new Response(text, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('Admin list via DO failed:', e);
      try { await sendToSentry(env, e, { path: url.pathname }, ctx); } catch (_) {}
    }

    const tunnelUrl = env.TUNNEL_URL || env.VPS_EXPRESS_URL || '';
    if (!tunnelUrl) {
      return new Response(JSON.stringify({ error: 'VPS Express unreachable', message: 'No tunnel URL configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const apiUrl = `${tunnelUrl.replace(/\/$/, '')}/api/recruitment/list`;

    try {
      const serviceToken = env.SERVICE_TOKEN;
      if (!serviceToken) {
        return new Response(JSON.stringify({ error: 'Internal server error', message: 'Service token not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const resp = await fetch(apiUrl, { method: 'GET', headers: { 'x-service-token': serviceToken } });
      const responseText = await resp.text();
      let data;
      try { data = JSON.parse(responseText); } catch (_parseError) {
        if (responseText.includes('error code:') || responseText.includes('cloudflare')) {
          return new Response(JSON.stringify({ error: 'VPS Express unreachable', message: 'Cloudflare Tunnel might be down', details: responseText.substring(0, 200) }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: 'Invalid response from VPS Express', details: responseText.substring(0, 200) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(data), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error', message: error.message, errorType: error.name, debugInfo: { tunnelUrl: env.TUNNEL_URL || env.VPS_EXPRESS_URL || 'not set', serviceTokenConfigured: !!env.SERVICE_TOKEN, timestamp: new Date().toISOString() } }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  return null;
}
