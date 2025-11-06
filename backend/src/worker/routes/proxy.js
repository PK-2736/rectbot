// routes/proxy.js
export async function routeProxy(request, env, ctx, url, corsHeaders) {
  if (url.pathname.startsWith('/images/')) {
    const targetURL = 'https://api.recrubo.net' + url.pathname + url.search;
    const resp = await fetch(targetURL, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
    const respHeaders = Array.from(resp.headers.entries()).filter(([key]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase()));
    const buf = await resp.arrayBuffer();
    return new Response(buf, { status: resp.status, headers: { ...corsHeaders, ...Object.fromEntries(respHeaders) } });
  }
  return null;
}
