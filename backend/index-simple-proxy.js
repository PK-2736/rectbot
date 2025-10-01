// シンプルなプロキシ版 Cloudflare Worker
// すべてのリクエストをVPS Expressに転送するだけ

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS プリフライト
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    // 認証チェック
    const authHeader = request.headers.get("Authorization");
    const expectedToken = `Bearer ${env.SERVICE_TOKEN}`;
    
    // 認証不要のパス
    const publicPaths = ['/api/test', '/health', '/healthz'];
    const requiresAuth = !publicPaths.some(path => url.pathname.startsWith(path));
    
    if (requiresAuth && authHeader !== expectedToken) {
      console.warn(`[Auth] Unauthorized access to ${url.pathname}`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // VPS Express URL を取得
    const vpsExpressUrl = env.VPS_EXPRESS_URL;
    
    if (!vpsExpressUrl) {
      console.error('[Proxy] VPS_EXPRESS_URL not configured');
      return new Response(
        JSON.stringify({ error: 'Backend not configured' }), 
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // プロキシ先のURLを構築
    const targetUrl = `${vpsExpressUrl}${url.pathname}${url.search}`;
    console.log(`[Proxy] ${request.method} ${url.pathname} -> ${targetUrl}`);

    try {
      // タイムアウト付きでリクエスト転送
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25秒

      const apiRes = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' 
          ? request.body 
          : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // レスポンスヘッダーをコピー
      const responseHeaders = new Headers(apiRes.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      console.log(`[Proxy] Response status: ${apiRes.status}`);

      return new Response(apiRes.body, {
        status: apiRes.status,
        headers: responseHeaders
      });

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error('[Proxy] Request timeout (25s)');
        return new Response(
          JSON.stringify({ 
            error: 'Gateway Timeout',
            message: 'Backend server did not respond in time'
          }), 
          { 
            status: 504,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        );
      }

      console.error('[Proxy] Error:', error.message);
      return new Response(
        JSON.stringify({ 
          error: 'Bad Gateway',
          message: 'Failed to reach backend server',
          details: error.message
        }), 
        { 
          status: 502,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  }
};
