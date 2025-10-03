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
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return res.json();
}

async function getDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

/**
 * Discord OAuth セッション検証
 * Authorization ヘッダーの Bearer トークンを検証
 */
function isValidDiscordAdmin(authHeader, env) {
  if (!authHeader) {
    console.log('No Authorization header provided');
    return false;
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  if (!token || token.length === 0) {
    console.log('Invalid token format');
    return false;
  }
  
  // TODO: 実運用では以下を実装
  // 1. JWT トークンの検証（jwt.verify）
  // 2. Discord API でユーザー情報取得
  // 3. 管理者リスト（env.ADMIN_DISCORD_IDS）との照合
  // 4. セッションストア（KV）でセッション有効期限チェック
  
  // 暫定：トークンの存在チェック
  // 実運用では JWT 検証やセッションストアとの照合を実装してください
  console.log('Token validation passed (temporary implementation)');
  return true;
}

/**
 * CORS ヘッダーを生成
 */
function getCorsHeaders(origin) {
  const allowedOrigins = [
    'https://dash.rectbot.tech',
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

    // 管理者用 API：Discord OAuth 認証が必要
    if (url.pathname === '/api/recruitment/list') {
      console.log('Admin API: /api/recruitment/list accessed');
      
      const authHeader = request.headers.get('Authorization');
      
      if (!isValidDiscordAdmin(authHeader, env)) {
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

        const data = await resp.json();
        
        console.log(`Express API responded with status: ${resp.status}`);

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
        const userAgent = request.headers.get('user-agent') || '';
        const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
        
        // 1. 認証トークン検証
        if (!SERVICE_TOKEN) {
          return new Response(JSON.stringify({ error: 'service_unavailable' }), { 
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        
        let token = '';
        if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
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
        // 環境変数からDiscord情報取得
        const clientId = env.REACT_APP_DISCORD_CLIENT_ID;
        const clientSecret = env.DISCORD_CLIENT_SECRET;
        const redirectUri = env.REACT_APP_DISCORD_REDIRECT_URI;
        
        // Discordトークン取得
        const tokenData = await getDiscordToken(code, redirectUri, clientId, clientSecret);
        if (!tokenData.access_token) {
          return new Response('<!DOCTYPE html><html><body><h1>認証エラー</h1><p>Discordトークンの取得に失敗しました</p></body></html>', {
            status: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
        
        // Discordユーザー情報取得
        const user = await getDiscordUser(tokenData.access_token);
        
        // ダッシュボードにリダイレクト（ユーザー情報をクエリパラメータで渡す）
        const dashboardUrl = new URL('https://dash.rectbot.tech/');
        dashboardUrl.searchParams.set('auth_success', 'true');
        dashboardUrl.searchParams.set('user_id', user.id);
        dashboardUrl.searchParams.set('username', user.username);
        
        return new Response('', {
          status: 302,
          headers: {
            'Location': dashboardUrl.toString(),
            ...corsHeaders
          }
        });
        
      } catch (error) {
        console.error('Discord OAuth error:', error);
        return new Response('<!DOCTYPE html><html><body><h1>認証エラー</h1><p>認証処理中にエラーが発生しました</p></body></html>', {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
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

    // すべてのルートにマッチしなかった場合の404レスポンス
    return new Response("Not Found", { 
      status: 404, 
      headers: corsHeaders 
    });
  },
};