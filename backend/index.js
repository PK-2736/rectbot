// JWT library (install: npm install jsonwebtoken)
// For Worker environment, use: npm install @tsndr/cloudflare-worker-jwt
// import jwt from '@tsndr/cloudflare-worker-jwt';

/**
 * Supabase クライアント初期化
 */
function getSupabaseClient(env) {
  // Supabase クライアントは環境変数から初期化
  // Worker 環境では @supabase/supabase-js を使用
  // import { createClient } from '@supabase/supabase-js';
  // return createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  
  // 簡易実装（実際には @supabase/supabase-js を使用）
  return {
    from: (table) => ({
      upsert: async (data) => {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(data)
        });
        return res.json();
      },
      select: async (columns) => {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=${columns}`, {
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        return res.json();
      }
    })
  };
}

// ----- Sentry minimal HTTP reporter for Cloudflare Worker when @sentry/cloudflare isn't used -----
async function sendToSentry(env, error, extra = {}) {
  try {
    if (!env || !env.SENTRY_DSN) return;
    const dsn = env.SENTRY_DSN;
    // DSN format: https://<publicKey>@o<org>.ingest.sentry.io/<projectId>
    const m = dsn.match(/^https:\/\/([^@]+)@([^\/]+)\/(\d+)$/);
    if (!m) return;
    const publicKey = m[1];
    const host = m[2];
    const projectId = m[3];
    const storeUrl = `https://${host}/api/${projectId}/store/?sentry_key=${publicKey}`;

    const event = {
      message: (error && (error.message || String(error))) || 'Unknown error',
      level: 'error',
      logger: 'rectbot.backend',
      extra: { ...extra, stack: error && error.stack },
      timestamp: new Date().toISOString(),
    };

    await fetch(storeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (e) {
    // avoid throwing from error reporter
    console.warn('sendToSentry failed', e);
  }
}

/**
 * 管理者かどうかをチェック
 */
function isAdmin(discordId, env) {
  const adminIds = (env.ADMIN_DISCORD_ID || '').split(',').map(id => id.trim());
  return adminIds.includes(discordId);
}

/**
 * JWT 発行（ログイン時）
 * 実運用では @tsndr/cloudflare-worker-jwt を使用推奨
 */
async function issueJWT(userInfo, env) {
  const payload = {
    userId: userInfo.id,
    username: userInfo.username,
    role: isAdmin(userInfo.id, env) ? 'admin' : 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1時間
  };
  
  // Base64 エンコード（簡易実装）
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  
  // HMAC-SHA256 署名
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${header}.${body}`)
  );
  
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${header}.${body}.${signatureBase64}`;
}

/**
 * JWT 検証
 * 実運用では @tsndr/cloudflare-worker-jwt を使用推奨
 */
async function verifyJWT(token, env) {
  try {
    const [header, body, signature] = token.split('.');
    
    if (!header || !body || !signature) {
      throw new Error('Invalid token format');
    }
    
    // ペイロード解析
    const payload = JSON.parse(atob(body));
    
    // 有効期限チェック
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }
    
    // 署名検証（簡易実装）
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signatureBytes = Uint8Array.from(
      atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(`${header}.${body}`)
    );
    
    if (!isValid) {
      throw new Error('Invalid signature');
    }
    
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// Discord OAuth用
async function getDiscordToken(code, redirectUri, clientId, clientSecret) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: 'identify email',
  });
  
  console.log('Discord token request - Full details:', {
    redirect_uri: redirectUri,
    redirect_uri_length: redirectUri?.length,
    redirect_uri_encoded: encodeURIComponent(redirectUri),
    client_id: clientId,
    client_secret_present: !!clientSecret,
    code_present: !!code,
    code_length: code?.length,
    code_preview: code ? `${code.substring(0, 10)}...` : 'none'
  });
  
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    console.error('Discord API error:', {
      status: res.status,
      statusText: res.statusText,
      error: data
    });
  }
  
  return data;
}

async function getDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

/**
 * Discord OAuth 認証完了後の処理
 */
async function handleDiscordCallback(code, env) {
  try {
    console.log('handleDiscordCallback: Starting OAuth flow');
    console.log('Environment check:', {
      DISCORD_CLIENT_ID: !!env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: !!env.DISCORD_CLIENT_SECRET,
      DISCORD_REDIRECT_URI: !!env.DISCORD_REDIRECT_URI,
      JWT_SECRET: !!env.JWT_SECRET
    });
    
    // Discord トークン取得
    const tokenData = await getDiscordToken(
      code,
      env.DISCORD_REDIRECT_URI,
      env.DISCORD_CLIENT_ID,
      env.DISCORD_CLIENT_SECRET
    );
    
    if (!tokenData.access_token) {
      console.error('Token data received:', tokenData);
      throw new Error(`Failed to get Discord access token: ${tokenData.error || 'unknown error'} - ${tokenData.error_description || 'no description'}`);
    }
    
    // Discord ユーザー情報取得
    const userInfo = await getDiscordUser(tokenData.access_token);
    
    // Supabase にユーザー情報保存（オプショナル - エラーでも続行）
    try {
      if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = getSupabaseClient(env);
        await supabase.from('users').upsert({
          user_id: userInfo.id,
          discord_id: userInfo.id,
          username: userInfo.username,
          discriminator: userInfo.discriminator || '0',
          avatar: userInfo.avatar,
          role: isAdmin(userInfo.id, env) ? 'admin' : 'user',
          last_login: new Date().toISOString()
        });
        console.log('User info saved to Supabase');
      } else {
        console.log('Supabase not configured, skipping user save');
      }
    } catch (supabaseError) {
      console.error('Failed to save user to Supabase (non-fatal):', supabaseError);
      // エラーでも続行
    }
    
    // JWT 発行
    const jwt = await issueJWT(userInfo, env);
    
    return { jwt, userInfo };
    
  } catch (error) {
    console.error('Discord OAuth callback error:', error);
    throw error;
  }
}

/**
 * Discord OAuth セッション検証（JWT ベース）
 */
async function isValidDiscordAdmin(cookieHeader, env) {
  if (!cookieHeader) {
    console.log('No Cookie header provided');
    return false;
  }
  
  // Cookie から JWT 取得
  const jwtMatch = cookieHeader.match(/jwt=([^;]+)/);
  if (!jwtMatch) {
    console.log('No JWT cookie found');
    return false;
  }
  
  const jwt = jwtMatch[1];
  const payload = await verifyJWT(jwt, env);
  
  if (!payload) {
    console.log('Invalid JWT');
    return false;
  }
  
  if (payload.role !== 'admin') {
    console.log('User is not admin');
    return false;
  }
  
  console.log('JWT validation passed for admin:', payload.userId);
  return true;
}

/**
 * CORS ヘッダーを生成
 */
function getCorsHeaders(origin) {
  const allowedOrigins = [
    'https://dash.rectbot.tech',
    'https://rectbot.tech',
    'https://www.rectbot.tech',
    'http://localhost:3000',
    'http://localhost:3001'
  ];
  
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-token',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);

    // プリフライトリクエスト
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // デバッグ用: 環境変数チェック（管理者のみ）
    if (request.method === 'GET' && url.pathname === '/api/debug/env') {
      const cookieHeader = request.headers.get('Cookie');
      
      if (!await isValidDiscordAdmin(cookieHeader, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      // 環境変数の状態を返す（値は返さない、存在確認のみ）
      return new Response(
        JSON.stringify({
          envStatus: {
            DISCORD_CLIENT_ID: !!env.DISCORD_CLIENT_ID,
            DISCORD_CLIENT_SECRET: !!env.DISCORD_CLIENT_SECRET,
            DISCORD_REDIRECT_URI: !!env.DISCORD_REDIRECT_URI,
            JWT_SECRET: !!env.JWT_SECRET,
            ADMIN_DISCORD_ID: !!env.ADMIN_DISCORD_ID,
            SERVICE_TOKEN: !!env.SERVICE_TOKEN,
            TUNNEL_URL: !!env.TUNNEL_URL,
            VPS_EXPRESS_URL: !!env.VPS_EXPRESS_URL,
            SUPABASE_URL: !!env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY
          },
          tunnelUrlPreview: env.TUNNEL_URL || env.VPS_EXPRESS_URL ? 
            (env.TUNNEL_URL || env.VPS_EXPRESS_URL).substring(0, 30) + '...' : 
            'not set'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // ユーザー情報取得API (GET) - JWTからユーザー情報を返す
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const cookieHeader = request.headers.get('Cookie');
      
      if (!cookieHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'No authentication cookie' }),
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Cookie から JWT 取得
      const jwtMatch = cookieHeader.match(/jwt=([^;]+)/);
      if (!jwtMatch) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'No JWT token found' }),
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      const jwt = jwtMatch[1];
      const payload = await verifyJWT(jwt, env);
      
      if (!payload) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'Invalid or expired token' }),
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      // ユーザー情報を返す
      const userInfo = {
        id: payload.userId,
        username: payload.username,
        role: payload.role,
        isAdmin: payload.role === 'admin'
      };
      
      console.log('Auth check - User:', userInfo.username, 'Role:', userInfo.role);
      
      return new Response(
        JSON.stringify(userInfo),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Discord OAuthコールバックAPI (GET) - DiscordからのリダイレクトURL処理
    if (request.method === 'GET' && url.pathname === '/api/discord/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('<!DOCTYPE html><html><body><h1>認証エラー</h1><p>認証コードが見つかりません</p></body></html>', {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      
      try {
        // Discord OAuth 処理 + Supabase 保存 + JWT 発行
        const { jwt, userInfo } = await handleDiscordCallback(code, env);
        
        console.log('Discord OAuth success:', userInfo.username);
        console.log('User ID:', userInfo.id);
        console.log('User role:', isAdmin(userInfo.id, env) ? 'admin' : 'user');
        
        // ダッシュボードにリダイレクト（JWT を HttpOnly Cookie として設定）
        const dashboardUrl = new URL('https://dash.rectbot.tech/');
        
        const cookieValue = `jwt=${jwt}; Domain=.rectbot.tech; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`;
        console.log('Setting cookie:', cookieValue.substring(0, 50) + '...');
        
        // Domain属性を設定してサブドメイン間でCookieを共有
        return new Response('', {
          status: 302,
          headers: {
            'Location': dashboardUrl.toString(),
            'Set-Cookie': cookieValue,
            ...corsHeaders
          }
        });
        
      } catch (error) {
        console.error('Discord OAuth error:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          env_check: {
            DISCORD_CLIENT_ID: !!env.DISCORD_CLIENT_ID,
            DISCORD_CLIENT_SECRET: !!env.DISCORD_CLIENT_SECRET,
            DISCORD_REDIRECT_URI: !!env.DISCORD_REDIRECT_URI,
            JWT_SECRET: !!env.JWT_SECRET,
            SUPABASE_URL: !!env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY
          }
        });
        
        // デバッグ用：エラーメッセージを表示（本番環境では削除すべき）
        const errorHtml = `<!DOCTYPE html><html><body>
          <h1>認証エラー</h1>
          <p>認証処理中にエラーが発生しました</p>
          <details>
            <summary>詳細情報（デバッグ用）</summary>
            <pre>${error.message}</pre>
          </details>
        </body></html>`;
        
        return new Response(errorHtml, {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    }

    // 管理者用 API：Discord OAuth 認証が必要（JWT ベース）
    if (url.pathname === '/api/recruitment/list') {
      console.log('Admin API: /api/recruitment/list accessed');
      console.log('Origin:', origin);
      
      const cookieHeader = request.headers.get('Cookie');
      console.log('Cookie header:', cookieHeader ? 'present' : 'missing');
      
      if (!await isValidDiscordAdmin(cookieHeader, env)) {
        console.log('Unauthorized access attempt to admin API');
        return new Response(
          JSON.stringify({ 
            error: 'Unauthorized',
            message: 'Discord authentication required'
          }),
          { 
            status: 401,
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json' 
            }
          }
        );
      }

      // VPS Express へのプロキシ（Service Token 付与）
      const tunnelUrl = env.TUNNEL_URL || env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
      const apiUrl = `${tunnelUrl.replace(/\/$/, '')}/api/recruitment/list`;
      
      console.log(`Proxying to Express API: ${apiUrl}`);
      
      try {
        const serviceToken = env.SERVICE_TOKEN;
        
        if (!serviceToken) {
          console.error('SERVICE_TOKEN not configured');
          return new Response(
            JSON.stringify({ error: 'Internal server error', message: 'Service token not configured' }),
            { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
        const resp = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'x-service-token': serviceToken,
          },
        });

        console.log(`Express API responded with status: ${resp.status}`);
        console.log(`Express API content-type: ${resp.headers.get('content-type')}`);
        
        // レスポンスをテキストとして取得
        const responseText = await resp.text();
        console.log(`Express API response (first 200 chars): ${responseText.substring(0, 200)}`);
        
        // JSONとしてパース可能かチェック
        let data;
        try {
          data = JSON.parse(responseText);
          console.log(`Fetched ${Array.isArray(data) ? data.length : 0} recruitments from Express API`);
        } catch (parseError) {
          console.error('Failed to parse Express API response as JSON:', parseError);
          console.error('Raw response:', responseText);
          
          // Cloudflare Tunnel エラーの可能性
          if (responseText.includes('error code:') || responseText.includes('cloudflare')) {
            return new Response(
              JSON.stringify({ 
                error: 'VPS Express unreachable',
                message: 'VPS Express サーバーに接続できません。Cloudflare Tunnel が正しく動作しているか確認してください。',
                details: responseText.substring(0, 200)
              }),
              { 
                status: 503,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
          
          return new Response(
            JSON.stringify({ 
              error: 'Invalid response from VPS Express',
              message: 'VPS Express が正しいJSON形式のレスポンスを返していません',
              details: responseText.substring(0, 200)
            }),
            { 
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        return new Response(JSON.stringify(data), {
          status: resp.status,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          },
        });
        
      } catch (error) {
        console.error('Error proxying to Express API:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // より詳細なエラー情報を返す
        return new Response(
          JSON.stringify({ 
            error: 'Internal server error',
            message: error.message,
            errorType: error.name,
            details: `Failed to connect to VPS Express API. Error: ${error.message}`,
            debugInfo: {
              tunnelUrl: env.TUNNEL_URL || env.VPS_EXPRESS_URL || 'not set',
              serviceTokenConfigured: !!env.SERVICE_TOKEN,
              timestamp: new Date().toISOString()
            }
          }),
          { 
            status: 500,
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json' 
            }
          }
        );
      }

      /* VPS Express へのプロキシ（暫定的にコメントアウト）
      // Express API にプロキシ（Service Token 付与）
      const tunnelUrl = env.TUNNEL_URL || env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
      const apiUrl = `${tunnelUrl.replace(/\/$/, '')}/api/recruitment/list`;
      
      console.log(`Proxying to Express API: ${apiUrl}`);
      
      try {
        const serviceToken = env.SERVICE_TOKEN;
        
        if (!serviceToken) {
          console.error('SERVICE_TOKEN not configured');
          return new Response(
            JSON.stringify({ error: 'Internal server error', message: 'Service token not configured' }),
            { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
        const resp = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'x-service-token': serviceToken,
          },
        });

        console.log(`Express API responded with status: ${resp.status}`);
        console.log(`Express API content-type: ${resp.headers.get('content-type')}`);
        
        // レスポンスをテキストとして取得
        const responseText = await resp.text();
        console.log(`Express API response (first 200 chars): ${responseText.substring(0, 200)}`);
        
        // JSONとしてパース可能かチェック
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse Express API response as JSON:', parseError);
          console.error('Raw response:', responseText);
          
          // Cloudflare Tunnel エラーの可能性
          if (responseText.includes('error code:') || responseText.includes('cloudflare')) {
            return new Response(
              JSON.stringify({ 
                error: 'VPS Express unreachable',
                message: 'VPS Express サーバーに接続できません。Cloudflare Tunnel が正しく動作しているか確認してください。',
                details: responseText.substring(0, 200)
              }),
              { 
                status: 503,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
          
          return new Response(
            JSON.stringify({ 
              error: 'Invalid response from VPS Express',
              message: 'VPS Express が正しいJSON形式のレスポンスを返していません',
              details: responseText.substring(0, 200)
            }),
            { 
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        return new Response(JSON.stringify(data), {
          status: resp.status,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          },
        });
        
      } catch (error) {
        console.error('Error proxying to Express API:', error);
        return new Response(
          JSON.stringify({ 
            error: 'Internal server error',
            message: error.message 
          }),
          { 
            status: 500,
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json' 
            }
          }
        );
      }
      */
    }

    // Service Token 認証
    const SERVICE_TOKEN = env.SERVICE_TOKEN || '';
    const isApiPath = url.pathname.startsWith('/api');
    const skipTokenPaths = ['/api/test', '/api/discord/callback', '/api/dashboard'];
    const requiresAuth = isApiPath && !skipTokenPaths.some(path => url.pathname.startsWith(path));
    
    if (requiresAuth && SERVICE_TOKEN) {
      const authHeader = request.headers.get('authorization') || '';
      const serviceTokenHeader = request.headers.get('x-service-token') || '';
      
      let token = '';
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (serviceTokenHeader) {
        token = serviceTokenHeader.trim();
      }
      
      if (!token || token !== SERVICE_TOKEN) {
        console.warn(`[Auth] Unauthorized access attempt to ${url.pathname}`);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // プロキシ処理：画像関連のパスをバックエンドにプロキシ
    if (url.pathname.startsWith('/images/')) {
      console.log(`[PROXY] Proxying image request: ${url.pathname}`);
      const targetURL = 'https://api.rectbot.tech' + url.pathname + url.search;
      
      const resp = await fetch(targetURL, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });
      
      const respHeaders = Array.from(resp.headers.entries()).filter(([key]) => 
        !['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())
      );
      
      const buf = await resp.arrayBuffer();
      return new Response(buf, { status: resp.status, headers: { ...corsHeaders, ...Object.fromEntries(respHeaders) } });
    }

    // --- Discord bot recruitment data push endpoint ---
    if (url.pathname === '/api/recruitment/push' && request.method === 'POST') {
      try {
        // セキュリティ検証
        const authHeader = request.headers.get('authorization') || '';
        const serviceTokenHeader = request.headers.get('x-service-token') || '';
        const userAgent = request.headers.get('user-agent') || '';
        const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
        
        // 1. 認証トークン検証
        if (!SERVICE_TOKEN) {
          return new Response(JSON.stringify({ error: 'service_unavailable' }), { 
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        
        let token = '';
        // Check x-service-token header first (preferred method)
        if (serviceTokenHeader) {
          token = serviceTokenHeader.trim();
        }
        // Fall back to Authorization: Bearer if x-service-token not present
        else if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
          token = authHeader.slice(7).trim();
        }
        
        if (!token || token !== SERVICE_TOKEN) {
          console.warn(`[security] Unauthorized push attempt from IP: ${clientIP}, UA: ${userAgent}`);
          return new Response(JSON.stringify({ error: 'unauthorized' }), { 
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        
        // 2. User-Agent検証（Discord botからの正当なリクエストか）
        if (!userAgent.includes('node') && !userAgent.includes('discord')) {
          console.warn(`[security] Suspicious User-Agent from IP: ${clientIP}, UA: ${userAgent}`);
          return new Response(JSON.stringify({ error: 'forbidden' }), { 
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        
        console.log(`[worker][recruitment-push] Request received from IP: ${clientIP}`);
        
        const data = await request.json();
        console.log(`[worker][recruitment-push] Received data:`, JSON.stringify(data, null, 2));
        
        // 4. データ検証強化
        if (!data.recruitId || !data.guildId) {
          console.error(`[worker][recruitment-push] Missing required fields. recruitId: ${data.recruitId}, guildId: ${data.guildId}`);
          return new Response(JSON.stringify({ 
            error: 'invalid_data', 
            detail: 'recruitId and guildId are required' 
          }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // 5. 入力サニタイゼーション
        const sanitizedData = {
          recruitId: String(data.recruitId).slice(0, 50),
          guildId: String(data.guildId).slice(0, 20),
          channelId: String(data.channelId || '').slice(0, 20),
          message_id: String(data.message_id || '').slice(0, 20),
          status: String(data.status || 'recruiting').slice(0, 20),
          start_time: data.start_time || new Date().toISOString()
        };
        
        console.log(`[worker][recruitment-push] Authorized request from IP: ${clientIP}, recruitId: ${sanitizedData.recruitId}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          recruitId: sanitizedData.recruitId,
          guildId: sanitizedData.guildId,
          message: 'Data received successfully'
        }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (err) {
        console.error('[worker][recruitment-push] Error:', err);
        return new Response(JSON.stringify({ 
          error: 'internal_error'
        }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ダッシュボードAPI - 全募集データ取得（認証不要）
    if (url.pathname === "/api/dashboard/recruitment" && request.method === "GET") {
      try {
        console.log('[GET] Proxying dashboard recruitment list to VPS Express');
        
        const vpsExpressUrl = env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
        const vpsUrl = `${vpsExpressUrl}/api/dashboard/recruitment`;
        
        // タイムアウト付きでVPS Expressサーバーにリクエスト（認証なし）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        
        const vpsResponse = await fetch(vpsUrl, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseText = await vpsResponse.text();
        let responseBody;
        try {
          responseBody = JSON.parse(responseText);
        } catch (e) {
          responseBody = { raw: responseText };
        }
        
        console.log(`[GET] VPS Express dashboard response status: ${vpsResponse.status}`);
        
        return new Response(JSON.stringify(responseBody), {
          status: vpsResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[GET] Error proxying dashboard recruitment to VPS:', error.message || error);
        if (error.name === 'AbortError') {
          return new Response(JSON.stringify({ 
            error: 'gateway_timeout', 
            detail: 'VPS Express request timed out (25s)' 
          }), { 
            status: 504, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ 
          error: 'backend_unreachable', 
          detail: error.message 
        }), { 
          status: 502, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 募集データAPI - VPS Expressにプロキシ
    if (url.pathname === "/api/recruitment") {
      if (request.method === "POST") {
        try {
          console.log('[POST] Proxying recruitment save to VPS Express');
          
          // VPS ExpressサーバーのURL構築（Cloudflare Tunnel経由）
          const vpsExpressUrl = env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
          const vpsUrl = `${vpsExpressUrl}/api/recruitment`;
          
          // リクエストボディを取得
          const data = await request.json();
          
          // SERVICE_TOKENを使ってVPS Expressサーバーにプロキシ
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SERVICE_TOKEN || ''}`
          };
          
          const vpsResponse = await fetch(vpsUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
          });
          
          const responseText = await vpsResponse.text();
          let responseBody;
          try {
            responseBody = JSON.parse(responseText);
          } catch (e) {
            responseBody = { message: responseText };
          }
          
          console.log(`[POST] VPS Express response status: ${vpsResponse.status}`);
          
          return new Response(JSON.stringify(responseBody), {
            status: vpsResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
          
        } catch (error) {
          console.error('[POST] Error proxying to VPS Express:', error);
          return new Response(JSON.stringify({ 
            error: "Internal server error",
            details: error.message 
          }), { 
            status: 500, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      
      if (request.method === "GET") {
        try {
          console.log('[GET] Proxying recruitment list to VPS Express');
          
          // VPS ExpressサーバーのURL構築（Cloudflare Tunnel経由）
          const vpsExpressUrl = env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
          const vpsUrl = `${vpsExpressUrl}/api/recruitment`;
          
          // SERVICE_TOKENを使ってVPS Expressサーバーにプロキシ
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SERVICE_TOKEN || ''}`
          };
          
          const vpsResponse = await fetch(vpsUrl, {
            method: 'GET',
            headers
          });
          
          const responseText = await vpsResponse.text();
          let responseBody;
          try {
            responseBody = JSON.parse(responseText);
          } catch (e) {
            responseBody = { message: responseText };
          }
          
          console.log(`[GET] VPS Express response status: ${vpsResponse.status}`);
          
          return new Response(JSON.stringify(responseBody), {
            status: vpsResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
          
        } catch (error) {
          console.error('[GET] Error proxying to VPS Express:', error);
          return new Response(JSON.stringify({ 
            error: "Internal server error",
            details: error.message 
          }), { 
            status: 500, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      
      return new Response("Method Not Allowed", { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    // 募集データのステータス更新API（特定のメッセージID）- VPS Expressにプロキシ
    if (url.pathname.startsWith("/api/recruitment/") && request.method === "PATCH") {
      const messageId = url.pathname.split("/api/recruitment/")[1];
      if (!messageId) {
        return new Response(JSON.stringify({ error: "Message ID required" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      try {
        console.log(`[PATCH] Proxying recruitment update to VPS Express: ${messageId}`);
        
        // VPS ExpressサーバーのURL構築（Cloudflare Tunnel経由）
        const vpsExpressUrl = env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
        const vpsUrl = `${vpsExpressUrl}/api/recruitment/${messageId}`;
        
        // リクエストボディを取得
        const updateData = await request.json();
        
        // SERVICE_TOKENを使ってVPS Expressサーバーにプロキシ
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SERVICE_TOKEN || ''}`
        };
        
        console.log(`[PATCH] Sending request to: ${vpsUrl}`);
        
        // タイムアウト制御付きでVPSにリクエスト送信
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25秒タイムアウト
        
        let vpsResponse;
        try {
          vpsResponse = await fetch(vpsUrl, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updateData),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          console.log(`[PATCH] VPS Express response status: ${vpsResponse.status}`);
          
          // 522エラーやその他のCloudflareエラーの場合は特別な処理
          if (vpsResponse.status >= 520 && vpsResponse.status <= 530) {
            console.error(`[PATCH] Cloudflare error: ${vpsResponse.status}`);
            return new Response(JSON.stringify({
              error: "VPS Express server temporarily unavailable",
              status: vpsResponse.status,
              details: `Cloudflare error ${vpsResponse.status}: VPS Express server is not responding`
            }), {
              status: 503, // Service Unavailable
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          
          const responseText = await vpsResponse.text();
          let responseBody;
          try {
            responseBody = JSON.parse(responseText);
          } catch (e) {
            responseBody = { message: responseText };
          }
          
          return new Response(JSON.stringify(responseBody), {
            status: vpsResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
          
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            console.error('[PATCH] Request timeout (25s) to VPS Express');
            return new Response(JSON.stringify({
              error: "Request timeout",
              details: "VPS Express server did not respond within 25 seconds"
            }), {
              status: 504, // Gateway Timeout
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          
          throw fetchError; // 他のエラーは外側のcatchに任せる
        }
        
      } catch (error) {
        console.error('[PATCH] Error proxying to VPS Express:', error);
        return new Response(JSON.stringify({ 
          error: "Internal server error",
          details: error.message 
        }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 募集データ削除API（特定のメッセージID）- VPS Expressにプロキシ
    if (url.pathname.startsWith("/api/recruitment/") && request.method === "DELETE") {
      const messageId = url.pathname.split("/api/recruitment/")[1];
      if (!messageId) {
        return new Response(JSON.stringify({ error: "Message ID required" }), { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        console.log(`[DELETE] Proxying recruitment deletion to VPS Express: ${messageId}`);
        
        // VPS ExpressサーバーのURL構築（Cloudflare Tunnel経由）
        const vpsExpressUrl = env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
        const vpsUrl = `${vpsExpressUrl}/api/recruitment/${messageId}`;
        
        // SERVICE_TOKENを使ってVPS Expressサーバーにプロキシ
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SERVICE_TOKEN || ''}`
        };
        
        console.log(`[DELETE] Sending request to: ${vpsUrl}`);
        
        // タイムアウト制御付きでVPSにリクエスト送信
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト
        
        try {
          const vpsResponse = await fetch(vpsUrl, {
            method: 'DELETE',
            headers,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          console.log(`[DELETE] VPS Express response status: ${vpsResponse.status}`);
          console.log(`[DELETE] VPS Express response headers:`, Object.fromEntries(vpsResponse.headers.entries()));
          
          if (!vpsResponse.ok) {
            console.error(`[DELETE] VPS Express error: ${vpsResponse.status} ${vpsResponse.statusText}`);
            
            // 522エラーやその他のCloudflareエラーの場合は特別な処理
            if (vpsResponse.status >= 520 && vpsResponse.status <= 530) {
              return new Response(JSON.stringify({
                error: "VPS Express server temporarily unavailable",
                status: vpsResponse.status,
                details: `Cloudflare error ${vpsResponse.status}: VPS Express server is not responding`
              }), {
                status: 503, // Service Unavailable
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
          }
          
          const responseText = await vpsResponse.text();
          let responseBody;
          try {
            responseBody = JSON.parse(responseText);
          } catch (e) {
            responseBody = { message: responseText || `HTTP ${vpsResponse.status}` };
          }
          
          return new Response(JSON.stringify(responseBody), {
            status: vpsResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
          
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            console.error('[DELETE] Request timeout to VPS Express');
            return new Response(JSON.stringify({
              error: "Request timeout",
              details: "VPS Express server did not respond within 10 seconds"
            }), {
              status: 504, // Gateway Timeout
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          
          throw fetchError;
        }
        
      } catch (error) {
        console.error('[DELETE] Error proxying to VPS Express:', error);
        return new Response(JSON.stringify({ 
          error: "Internal server error",
          details: error.message 
        }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ギルド設定最終保存API
    if (url.pathname === "/api/guild-settings/finalize" && request.method === "POST") {
      try {
        // Accept payload that may contain guildId and setting fields
        const payload = await request.json();
        const guildId = payload && payload.guildId;
        const incomingSettings = { ...payload };
        delete incomingSettings.guildId;

        if (!guildId) {
          return new Response(JSON.stringify({ error: "Guild ID required" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        console.log(`[finalize] Starting finalization for guild: ${guildId}`);
        console.log('[finalize] Incoming settings:', incomingSettings);

        // Map incoming settings to Supabase format
        const supabaseData = {
          guild_id: guildId,
          recruit_channel_id: incomingSettings.recruit_channel || null,
          notification_role_id: incomingSettings.notification_role || null,
          default_title: incomingSettings.defaultTitle || "参加者募集",
          default_color: incomingSettings.defaultColor || "#00FFFF",
          update_channel_id: incomingSettings.update_channel || null,
          updated_at: new Date().toISOString()
        };
        
        console.log(`[finalize] Supabase data to save:`, supabaseData);
        
        // まず既存レコードがあるか確認
        const existingRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!existingRes.ok) {
          throw new Error(`Failed to check existing settings: ${existingRes.status} - ${await existingRes.text()}`);
        }
        
        const existingData = await existingRes.json();
        console.log(`[finalize] Existing guild settings:`, existingData);
        
        let supaRes;
        if (existingData && existingData.length > 0) {
          // 更新操作
          console.log(`[finalize] Updating existing guild settings for ${guildId}`);
          const patchBody = {
            updated_at: new Date().toISOString()
          };
          
          // Only include fields that are not null/undefined
          if (supabaseData.recruit_channel_id !== null) patchBody.recruit_channel_id = supabaseData.recruit_channel_id;
          if (supabaseData.notification_role_id !== null) patchBody.notification_role_id = supabaseData.notification_role_id;
          if (supabaseData.default_title) patchBody.default_title = supabaseData.default_title;
          if (supabaseData.default_color) patchBody.default_color = supabaseData.default_color;
          if (supabaseData.update_channel_id !== null) patchBody.update_channel_id = supabaseData.update_channel_id;

          supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
            method: 'PATCH',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(patchBody)
          });
        } else {
          // 新規作成
          console.log(`[finalize] Creating new guild settings for ${guildId}`);
          supaRes = await fetch(env.SUPABASE_URL + '/rest/v1/guild_settings', {
            method: 'POST',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(supabaseData)
          });
        }
        
        if (!supaRes.ok) {
          const errorText = await supaRes.text();
          console.error(`[finalize] Supabase operation failed:`);
          console.error(`[finalize] Status: ${supaRes.status}`);
          console.error(`[finalize] Status Text: ${supaRes.statusText}`);
          console.error(`[finalize] Response Body: ${errorText}`);
          throw new Error(`Supabase save failed: ${supaRes.status} - ${errorText}`);
        }
        
        console.log(`[finalize] Guild settings saved successfully for guild ${guildId}`);
        
        return new Response(JSON.stringify({ 
          ok: true, 
          message: "Settings saved successfully"
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
        
      } catch (error) {
        console.error('[finalize] Guild settings finalize error:', error);
        console.error('[finalize] Error stack:', error.stack);
        return new Response(JSON.stringify({ 
          error: "Internal server error",
          details: error.message,
          timestamp: new Date().toISOString()
        }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // デバッグ用テストエンドポイント
    if (url.pathname === '/api/test' && request.method === 'GET') {
      return new Response(JSON.stringify({ 
        message: 'Backend is working!', 
        timestamp: new Date().toISOString(),
        path: url.pathname,
        method: request.method
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ギルド設定取得API（Supabaseメイン）
    if (url.pathname.startsWith("/api/guild-settings/") && request.method === "GET") {
      try {
        const guildId = url.pathname.split("/api/guild-settings/")[1];
        
        if (!guildId) {
          return new Response(JSON.stringify({ error: "Guild ID required" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // Supabaseから設定を取得
        const supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!supaRes.ok) {
          throw new Error(`Supabase fetch failed: ${supaRes.status}`);
        }
        
        const data = await supaRes.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          // 設定が見つからない場合はデフォルト値を返す
          const defaultSettings = {
            recruit_channel: null,
            notification_role: null,
            defaultTitle: "参加者募集",
            defaultColor: "#00FFFF",
            update_channel: null
          };
          
          return new Response(JSON.stringify(defaultSettings), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // Supabaseのデータ形式をフロントエンド形式に変換
        const settings = {
          recruit_channel: data[0].recruit_channel_id,
          notification_role: data[0].notification_role_id,
          defaultTitle: data[0].default_title || "参加者募集",
          defaultColor: data[0].default_color || "#00FFFF",
          update_channel: data[0].update_channel_id
        };
        
        return new Response(JSON.stringify(settings), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('Guild settings fetch error:', error);
        try { await sendToSentry(env, error, { path: '/api/guild-settings/*' }); } catch(e){}
        
        // エラー時はデフォルト値を返す
        const defaultSettings = {
          recruit_channel: null,
          notification_role: null,
          defaultTitle: "参加者募集", 
          defaultColor: "#00FFFF",
          update_channel: null
        };
        
        return new Response(JSON.stringify(defaultSettings), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // サポート用問い合わせAPI
    if (url.pathname === '/api/support') {
      // プリフライト対応
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const data = await request.json();
        const { name, email, message, recaptchaToken } = data || {};

        if (!name || !email || !message) {
          return new Response(JSON.stringify({ error: '必須項目が入力されていません' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // reCAPTCHA v3 検証（設定されている場合）
        const scoreThreshold = parseFloat(env.RECAPTCHA_SCORE_THRESHOLD || '0.5');
        if (env.RECAPTCHA_SECRET) {
          if (!recaptchaToken) {
            return new Response(JSON.stringify({ error: 'reCAPTCHA token が必要です' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const params = new URLSearchParams();
          params.append('secret', env.RECAPTCHA_SECRET);
          params.append('response', recaptchaToken);

          const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });

          const verifyJson = await verifyRes.json();
          const success = verifyJson.success;
          const score = typeof verifyJson.score === 'number' ? verifyJson.score : Number(verifyJson.score || 0);

          if (!success || score < scoreThreshold) {
            try { await sendToSentry(env, new Error('reCAPTCHA failed'), { path: '/api/support', recaptcha: verifyJson }); } catch(e){}
            return new Response(JSON.stringify({ error: 'reCAPTCHA 検証に失敗しました' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // MailChannels 経由でメール送信
        const payload = {
          personalizations: [
            {
              to: [{ email: env.SUPPORT_EMAIL || 'support@rectbot.tech' }],
              dkim_domain: 'rectbot.tech',
              dkim_selector: 'mailchannels',
            }
          ],
          from: {
            email: 'noreply@rectbot.tech',
            name: 'Rectbot Support Form'
          },
          reply_to: { email },
          subject: `[Rectbot] お問い合わせ - ${name}`,
          content: [
            {
              type: 'text/plain',
              value: `\nお名前: ${name}\nメールアドレス: ${email}\n\nお問い合わせ内容:\n${message}\n\n---\n送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`
            }
          ]
        };

        const emailRes = await fetch('https://api.mailchannels.net/tx/v1/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const emailOk = emailRes && (typeof emailRes.ok === 'boolean' ? emailRes.ok : true);

        // メール送信が成功したら Discord に短い通知を送る（webhook が設定されている場合のみ）
        if (emailOk) {
          if (env.DISCORD_WEBHOOK_URL) {
            try {
              const body = { content: '📬 お問い合わせメールが届きました。' };
              const discordRes = await fetch(env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
              });
              if (!discordRes.ok) {
                console.warn('Discord notify returned non-ok status', await discordRes.text());
              }
            } catch (e) {
              console.warn('Discord notify failed', e);
            }
          }

          return new Response(JSON.stringify({ success: true, message: 'お問い合わせを受け付けました。ありがとうございます！' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        try { await sendToSentry(env, new Error('Support send failed'), { emailOk }); } catch(e){}
        console.error('Support send failed', { emailOk });
        return new Response(JSON.stringify({ error: '送信に失敗しました' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('Support API error:', error);
        // send minimal event to Sentry if configured
        try { await sendToSentry(env, error, { path: '/api/support' }); } catch(e){}
        return new Response(JSON.stringify({ error: '送信に失敗しました', details: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // すべてのルートにマッチしなかった場合の404レスポンス
    return new Response("Not Found", { 
      status: 404, 
      headers: corsHeaders 
    });
  },
};