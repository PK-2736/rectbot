addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  // Example: /recruit/{guildId}
  if (url.pathname.startsWith('/recruit/')) {
    const guildId = url.pathname.split('/')[2];
    const origin = `https://redis.rectbot.tech/api/redis/recruitment/${guildId}`;
    // Optionally attach internal secret or service token
    const headers = new Headers();
    const svc = SECRET_SERVICE_TOKEN || '';
    if (svc) headers.set('Authorization', `Bearer ${svc}`);
    try {
      const resp = await fetch(origin, { headers });
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { 'Content-Type': resp.headers.get('Content-Type') || 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'origin_unreachable', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}
