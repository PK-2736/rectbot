// JWT library (install: npm install jsonwebtoken)
// For Worker environment, use: npm install @tsndr/cloudflare-worker-jwt
// import jwt from '@tsndr/cloudflare-worker-jwt';

function resolveSupabaseRestUrl(env) {
  const candidates = [
    env.SUPABASE_URL,
    env.SUPABASE_REST_URL,
    env.PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.VITE_SUPABASE_URL,
    env.SUPABASE_PROJECT_URL
  ];

  if (env.SUPABASE_PROJECT_REF) {
    candidates.push(`https://${env.SUPABASE_PROJECT_REF}.supabase.co`);
  }

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.replace(/\/+$/, '');
    }
  }

  return null;
}

/**
 * Supabase クライアント初期化
 */
function getSupabaseClient(env) {
  const supabaseUrl = resolveSupabaseRestUrl(env);

  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured');
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role key is not configured');
  }

  // Supabase クライアントは環境変数から初期化
  // Worker 環境では @supabase/supabase-js を使用
  // import { createClient } from '@supabase/supabase-js';
  // return createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  
  // 簡易実装（実際には @supabase/supabase-js を使用）
  return {
    from: (table) => ({
      upsert: async (data) => {
        const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
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
        const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}`, {
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

// Lightweight ping to Supabase to wake free-tier projects.
// Returns true if the request completed (regardless of 2xx/4xx/5xx), false on network/timeout error.
async function pingSupabase(env, timeoutMs = 3000) {
  try {
    const supabaseRestUrl = resolveSupabaseRestUrl(env);
    if (!supabaseRestUrl || !env.SUPABASE_SERVICE_ROLE_KEY) return false;

    const target = `${supabaseRestUrl.replace(/\/+$/, '')}/rest/v1/guild_settings?select=*&limit=1`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(target, {
        method: 'GET',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        signal: controller.signal,
      });
      clearTimeout(id);
      // If we get any HTTP response, consider Supabase reachable for wake-up purposes
      return true;
    } catch (e) {
      clearTimeout(id);
      return false;
    }
  } catch (e) {
    return false;
  }
}

// ----- Sentry minimal HTTP reporter for Cloudflare Worker when @sentry/cloudflare isn't used -----
// Durable Object: RecruitsDO (singleton) for ephemeral recruitment cache with TTL
export class RecruitsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async loadStore() {
    const store = await this.state.storage.get('recruits');
    return store || { items: {}, list: [] }; // items: { [id]: data }, list: [id]
  }

  async saveStore(store) {
    await this.state.storage.put('recruits', store);
  }

  // Remove expired entries lazily
  cleanup(store) {
    const now = Date.now();
    const toDelete = [];
    for (const id of Object.keys(store.items)) {
      const rec = store.items[id];
      const exp = rec?.expiresAt ? Date.parse(rec.expiresAt) : 0;
      if (exp && exp <= now) {
        toDelete.push(id);
      }
    }
    if (toDelete.length) {
      for (const id of toDelete) {
        delete store.items[id];
        const idx = store.list.indexOf(id);
        if (idx >= 0) store.list.splice(idx, 1);
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const base = '/api/recruits';
    const method = request.method.toUpperCase();

    let store = await this.loadStore();
    this.cleanup(store);

    // GET list
    if (method === 'GET' && url.pathname === base) {
      const result = store.list.map((id) => store.items[id]).filter(Boolean);
      return new Response(JSON.stringify({ items: result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Paths with id
    const m = url.pathname.match(/^\/api\/recruits\/(.+?)(?:\/(join))?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const action = m[2] || '';

      if (method === 'GET' && !action) {
        const rec = store.items[id];
        if (!rec) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify(rec), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'PATCH' && !action) {
        const update = await safeReadJson(request);
        const rec = store.items[id];
        if (!rec) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        // update selected fields
        const allowed = ['title','description','game','platform','status','maxMembers','voice','metadata','expiresAt'];
        for (const k of allowed) {
          if (k in update) rec[k] = k === 'maxMembers' ? Number(update[k]) : update[k];
        }
        store.items[id] = rec;
        await this.saveStore(store);
        return new Response(JSON.stringify({ ok: true, recruit: rec }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'DELETE' && !action) {
        const body = await safeReadJson(request);
        const requester = body?.userId || body?.ownerId;
        const rec = store.items[id];
        if (!rec) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        // Simple owner check (optionally allow admins via env)
        const isOwner = requester && String(requester) === String(rec.ownerId);
        if (!isOwner) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        delete store.items[id];
        const idx = store.list.indexOf(id);
        if (idx >= 0) store.list.splice(idx, 1);
        await this.saveStore(store);
        return new Response(JSON.stringify({ ok: true, deleted: id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'join' && method === 'POST') {
        const body = await safeReadJson(request);
        const userId = body?.userId || body?.user_id;
        if (!userId) return new Response(JSON.stringify({ error: 'user_id_required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        const rec = store.items[id];
        if (!rec) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        rec.participants = Array.isArray(rec.participants) ? rec.participants : [];
        if (!rec.participants.includes(userId)) {
          if (rec.maxMembers && rec.participants.length >= Number(rec.maxMembers)) {
            return new Response(JSON.stringify({ error: 'full' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
          }
          rec.participants.push(userId);
        }
        store.items[id] = rec;
        await this.saveStore(store);
        return new Response(JSON.stringify({ ok: true, recruit: rec }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Create/Upsert
    if (method === 'POST' && url.pathname === base) {
      const data = await safeReadJson(request);
      const recruitId = (data?.recruitId || data?.id || '').toString();
      const ownerId = (data?.ownerId || data?.owner_id || '').toString();
      if (!recruitId || !ownerId) {
        return new Response(JSON.stringify({ error: 'recruitId_and_ownerId_required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const now = new Date();
      const ttlHours = Number(this.env.RECRUITS_TTL_HOURS || 8);
      const expiresAt = data?.expiresAt || new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();
      const rec = {
        id: recruitId,
        recruitId,
        ownerId,
        title: (data?.title || '').toString(),
        description: (data?.description || '').toString(),
        game: (data?.game || '').toString(),
        platform: (data?.platform || '').toString(),
        startTime: data?.startTime || now.toISOString(),
        maxMembers: Number(data?.maxMembers || 0) || undefined,
        voice: Boolean(data?.voice),
        participants: Array.isArray(data?.participants) ? data.participants.slice(0, 100) : [],
        createdAt: data?.createdAt || now.toISOString(),
        expiresAt,
        status: (data?.status || 'recruiting').toString(),
        metadata: data?.metadata || {}
      };

      store.items[recruitId] = rec;
      if (!store.list.includes(recruitId)) store.list.unshift(recruitId);
      await this.saveStore(store);
      return new Response(JSON.stringify({ ok: true, recruitId }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}

async function safeReadJson(request) {
  try {
    const txt = await request.text();
    if (!txt) return {};
    return JSON.parse(txt);
  } catch (_) {
    return {};
  }
}
function parseStackFrames(stack) {
  if (!stack) return [];
  const lines = String(stack).split('\n').slice(0, 50);
  const frames = [];
  const re = /\s*at\s+(.*?)\s+\(?(.+?):(\d+):(\d+)\)?/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const func = m[1] || '<anonymous>';
      const filename = m[2] || '<unknown>';
      const lineno = parseInt(m[3] || '0', 10) || 0;
      const colno = parseInt(m[4] || '0', 10) || 0;
      frames.push({ filename, function: func, lineno, colno, in_app: true });
    } else {
      // fallback: put the raw line as filename so something is visible
      frames.push({ filename: line.trim(), function: '<unknown>', lineno: 0, colno: 0, in_app: false });
    }
  }
  // Sentry expects frames from oldest to newest; reverse to keep newest last
  return frames.reverse();
}

async function sendToSentry(env, error, extra = {}, ctx = null) {
  try {
    if (!env || !env.SENTRY_DSN) return;
    const dsn = env.SENTRY_DSN;
    const m = dsn.match(/^https:\/\/([^@]+)@([^\/]+)\/(\d+)$/);
    if (!m) return;
    const publicKey = m[1];
    const host = m[2];
    const projectId = m[3];
    const storeUrl = `https://${host}/api/${projectId}/store/?sentry_key=${publicKey}`;

    const errMsg = (error && (error.message || String(error))) || 'Unknown error';
    const exception = error ? {
      values: [{
        type: error.name || 'Error',
        value: errMsg,
        stacktrace: { frames: parseStackFrames(error.stack) }
      }]
    } : undefined;

    const event = {
      message: errMsg,
      exception,
      level: 'error',
      logger: 'rectbot.backend',
      platform: 'javascript',
      sdk: { name: 'custom.rectbot.worker', version: '0.1' },
      tags: { path: extra && extra.path ? String(extra.path) : undefined },
      extra: { ...extra, stack: error && error.stack },
      timestamp: new Date().toISOString(),
    };

    // Optionally attach a minimal request snapshot (avoid full body unless explicitly provided)
    if (extra && extra.requestInfo) event.request = extra.requestInfo;

    const body = JSON.stringify(event);

    // If a Worker context is available, send asynchronously so response isn't delayed
    if (ctx && typeof ctx.waitUntil === 'function') {
      try {
        ctx.waitUntil(fetch(storeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'rectbot-worker/0.1' },
          body
        }));
      } catch (e) {
        console.warn('sendToSentry (ctx.waitUntil) failed', e);
      }
      return;
    }

    // Otherwise await the send (best-effort)
    await fetch(storeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'rectbot-worker/0.1' },
      body
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
      const supabaseRestUrl = resolveSupabaseRestUrl(env);
      if (supabaseRestUrl && env.SUPABASE_SERVICE_ROLE_KEY) {
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
    'https://dash.recrubo.net',
    'https://recrubo.net',
    'https://www.recrubo.net',
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
            SUPABASE_URL: !!resolveSupabaseRestUrl(env),
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
      // 管理者用 API：Discord OAuth 認証が必要（JWT ベース）
      if (url.pathname === '/api/recruitment/list') {
        console.log('Admin API: /api/recruitment/list accessed');
        const cookieHeader = request.headers.get('Cookie');
        if (!await isValidDiscordAdmin(cookieHeader, env)) {
          return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Discord authentication required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Reuse DO list (no Redis requirement for admin)
        try {
          const id = env.RECRUITS_DO.idFromName('global');
          const stub = env.RECRUITS_DO.get(id);
          const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
          const text = await resp.text();
          return new Response(text, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (e) {
          console.error('Admin list via DO failed:', e);
          await sendToSentry(env, e, { path: url.pathname }, ctx);
          return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
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
  // Paths that do not require SERVICE_TOKEN header (public endpoints)
  const skipTokenPaths = ['/api/test', '/api/discord/callback', '/api/dashboard', '/api/support', '/metrics', '/api/grafana/recruits'];
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

    // 軽量な環境変数診断（Service Token 必須、値は返さず存在のみ）
    if (url.pathname === '/api/debug/env-lite' && request.method === 'GET') {
      // どの環境変数が採用されるかを特定（値は返さない）
      const sources = [
        ['SUPABASE_URL', env.SUPABASE_URL],
        ['SUPABASE_REST_URL', env.SUPABASE_REST_URL],
        ['PUBLIC_SUPABASE_URL', env.PUBLIC_SUPABASE_URL],
        ['NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL],
        ['VITE_SUPABASE_URL', env.VITE_SUPABASE_URL],
        ['SUPABASE_PROJECT_URL', env.SUPABASE_PROJECT_URL]
      ];
      if (env.SUPABASE_PROJECT_REF) {
        sources.push(['SUPABASE_PROJECT_REF', `https://${env.SUPABASE_PROJECT_REF}.supabase.co`]);
      }

      const resolvedUrl = resolveSupabaseRestUrl(env);
      let selectedSource = null;
      for (const [name, val] of sources) {
        if (typeof val === 'string' && val.trim() !== '') { selectedSource = name; break; }
      }

      let host = null;
      if (resolvedUrl) {
        try { host = new URL(resolvedUrl).host; } catch {}
      }

      return new Response(JSON.stringify({
        ok: true,
        supabase: {
          configured: !!resolvedUrl,
          source: selectedSource,
          host,
          preview: resolvedUrl ? (resolvedUrl.substring(0, 32) + '...') : null
        },
        serviceRoleKeyConfigured: !!env.SUPABASE_SERVICE_ROLE_KEY,
        timestamp: new Date().toISOString()
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Prometheus metrics endpoint for Grafana
    if (url.pathname === '/metrics' && request.method === 'GET') {
      try {
        const id = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(id);
        const listReq = new Request(new URL('/api/recruits', request.url).toString(), {
          method: 'GET',
          headers: { 'content-type': 'application/json' }
        });
        const resp = await stub.fetch(listReq);
        const data = await resp.json();
        const items = data.items || [];
        
        const now = Date.now();
        const activeRecruits = items.filter(r => {
          const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
          return exp > now && r.status === 'recruiting';
        });
        
        const metrics = [
          `# HELP recruits_total Total number of recruitment posts`,
          `# TYPE recruits_total gauge`,
          `recruits_total ${items.length}`,
          `# HELP recruits_active Active recruitment posts`,
          `# TYPE recruits_active gauge`,
          `recruits_active ${activeRecruits.length}`,
          `# HELP recruits_participants_total Total participants across all recruits`,
          `# TYPE recruits_participants_total gauge`,
          `recruits_participants_total ${items.reduce((sum, r) => sum + (r.participants?.length || 0), 0)}`
        ].join('\n');
        
        return new Response(metrics, {
          status: 200,
          headers: { 'content-type': 'text/plain; version=0.0.4', ...corsHeaders }
        });
      } catch (e) {
        console.error('[Metrics] Error:', e);
        return new Response('# Error generating metrics\n', {
          status: 500,
          headers: { 'content-type': 'text/plain; version=0.0.4', ...corsHeaders }
        });
      }
    }

    // JSON endpoint for Grafana JSON datasource plugin
    if (url.pathname === '/api/grafana/recruits' && request.method === 'POST') {
      try {
        const id = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(id);
        const listReq = new Request(new URL('/api/recruits', request.url).toString(), {
          method: 'GET',
          headers: { 'content-type': 'application/json' }
        });
        const resp = await stub.fetch(listReq);
        const data = await resp.json();
        const items = data.items || [];
        
        const now = Date.now();
        const activeRecruits = items.filter(r => {
          const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
          return exp > now && r.status === 'recruiting';
        });
        
        // Format for Grafana JSON datasource
        const formatted = activeRecruits.map(r => ({
          id: r.recruitId || r.id,
          title: r.title,
          game: r.game,
          platform: r.platform,
          ownerId: r.ownerId,
          currentMembers: r.participants?.length || 0,
          maxMembers: r.maxMembers || 0,
          voice: r.voice,
          status: r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          startTime: r.startTime
        }));
        
        return new Response(JSON.stringify(formatted), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error('[Grafana API] Error:', e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // RecruitsDO backed endpoints
    if (url.pathname.startsWith('/api/recruits')) {
      try {
        const id = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(id);
        const resp = await stub.fetch(request);
        const text = await resp.text();
        const contentType = resp.headers.get('content-type') || 'application/json';
        return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': contentType } });
      } catch (e) {
        console.error('[RecruitsDO proxy] Error:', e);
        await sendToSentry(env, e, { path: url.pathname }, ctx);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // プロキシ処理：画像関連のパスをバックエンドにプロキシ
    if (url.pathname.startsWith('/images/')) {
      console.log(`[PROXY] Proxying image request: ${url.pathname}`);
  const targetURL = 'https://api.recrubo.net' + url.pathname + url.search;
      
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
        console.log('[GET] dashboard recruitment via DO');
        const id = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(id);
        const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
        const text = await resp.text();
        return new Response(text, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('[GET] DO fetch error:', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // 募集データAPI - DO + Redis キャッシュ（二重）
    if (url.pathname === "/api/recruitment") {
      // helper: Upstash Redis REST
      const hasUpstash = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
      const redisPost = async (cmd) => {
        if (!hasUpstash) return null;
        try {
          const r = await fetch(env.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
          return r.ok ? r.json() : null;
        } catch { return null; }
      };
      const setJson = async (key, obj, ttl) => {
        if (!hasUpstash) return;
        await redisPost(['SET', key, JSON.stringify(obj), 'EX', String(ttl || 8*3600)]);
      };
      const getJson = async (key) => {
        if (!hasUpstash) return null;
        const res = await redisPost(['GET', key]);
        try { return res && res.result ? JSON.parse(res.result) : null; } catch { return null; }
      };
      const ttlHours = Number(env.RECRUITS_TTL_HOURS || 8);
      const ttlSec = ttlHours * 3600;

      if (request.method === "POST") {
        try {
          const data = await request.json();
          const idDo = env.RECRUITS_DO.idFromName('global');
          const stub = env.RECRUITS_DO.get(idDo);
          const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'POST', body: JSON.stringify(data) }));
          const bodyText = await resp.text();
          let parsed; try { parsed = JSON.parse(bodyText); } catch { parsed = { ok: false, raw: bodyText }; }
          if (parsed?.ok && data?.recruitId) {
            await setJson(`recruit:${data.recruitId}`, { ...data, createdAt: new Date().toISOString() }, ttlSec);
            // 更新が重いので list は DO のみ信頼（必要なら追加で保持）
          }
          return new Response(JSON.stringify(parsed), { status: resp.status || 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (error) {
          console.error('[POST]/api/recruitment error:', error);
          return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      if (request.method === "GET") {
        try {
          // まず Redis の一覧キーを見ない運用（単純化）。DO から取得。
          const idDo = env.RECRUITS_DO.idFromName('global');
          const stub = env.RECRUITS_DO.get(idDo);
          const resp = await stub.fetch(new Request(new URL('/api/recruits', url).toString(), { method: 'GET' }));
          const text = await resp.text();
          return new Response(text, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (error) {
          console.error('[GET]/api/recruitment error:', error);
          return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    // 募集データのステータス更新API（特定のメッセージID）- DO に委譲
    if (url.pathname.startsWith("/api/recruitment/") && request.method === "PATCH") {
      const messageId = url.pathname.split("/api/recruitment/")[1];
      if (!messageId) {
        return new Response(JSON.stringify({ error: "Message ID required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      try {
        const updateData = await request.json();
        const idDo = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(idDo);
        const resp = await stub.fetch(new Request(new URL(`/api/recruits/${encodeURIComponent(messageId)}`, url).toString(), { method: 'PATCH', body: JSON.stringify(updateData) }));
        const text = await resp.text();
        return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('[PATCH] Error updating via DO:', error);
        return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // 単体取得/削除: /api/recruitment/:id
    if (url.pathname.startsWith("/api/recruitment/") && (request.method === "GET" || request.method === "DELETE")) {
      const rid = url.pathname.split("/api/recruitment/")[1];
      if (!rid) {
        return new Response(JSON.stringify({ error: "Message ID required" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const method = request.method;
      // Minimal Upstash helper
      const hasUpstash = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
      const redisPost = async (cmd) => {
        if (!hasUpstash) return null;
        try { const r = await fetch(env.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) }); return r.ok ? r.json() : null; } catch { return null; }
      };
      if (method === 'GET') {
        // Try Redis first
        if (hasUpstash) {
          const res = await redisPost(['GET', `recruit:${rid}`]);
          if (res && res.result) {
            try { return new Response(res.result, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}
          }
        }
        // Fallback to DO
        const idDo = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(idDo);
        const resp = await stub.fetch(new Request(new URL(`/api/recruits/${encodeURIComponent(rid)}`, url).toString(), { method: 'GET' }));
        const text = await resp.text();
        return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (method === 'DELETE') {
        const body = await request.text();
        const idDo = env.RECRUITS_DO.idFromName('global');
        const stub = env.RECRUITS_DO.get(idDo);
        const resp = await stub.fetch(new Request(new URL(`/api/recruits/${encodeURIComponent(rid)}`, url).toString(), { method: 'DELETE', body }));
        const text = await resp.text();
        // best-effort delete cache
        if (hasUpstash) { await redisPost(['DEL', `recruit:${rid}`]); }
        return new Response(text, { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

        const supabaseRestUrl = resolveSupabaseRestUrl(env);
        const missingSupabaseConfig = [];

        if (!supabaseRestUrl) missingSupabaseConfig.push('SUPABASE_URL');
        if (!env.SUPABASE_SERVICE_ROLE_KEY) missingSupabaseConfig.push('SUPABASE_SERVICE_ROLE_KEY');

        // If Supabase is not configured, gracefully no-op instead of failing the bot flow
        if (missingSupabaseConfig.length > 0) {
          const detailMessage = `Missing Supabase configuration: ${missingSupabaseConfig.join(', ')}. Ensure SUPABASE_URL (or SUPABASE_REST_URL / SUPABASE_PROJECT_REF) and SUPABASE_SERVICE_ROLE_KEY are configured.`;
          console.warn(`[finalize] Supabase not configured, skipping persistence. ${detailMessage}`);
          // Return success so Discord 側のフローを止めない（設定は DO/メモリには保持しない）
          return new Response(JSON.stringify({
            ok: true,
            message: 'Settings accepted but not persisted (Supabase not configured)',
            warning: 'Supabase is not configured on the backend. No data was saved.',
            details: detailMessage
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const supabaseHeaders = {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        };
        // Ping Supabase once to wake free-tier projects (best-effort, do not fail the request)
        try {
          const pingOk = await pingSupabase(env, 4000);
          console.log(`[finalize] Supabase ping result: ${pingOk}`);
        } catch (e) {
          console.warn('[finalize] Supabase ping error:', e && e.message ? e.message : String(e));
        }
        
        // まず既存レコードがあるか確認
        const existingRes = await fetch(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'GET',
          headers: supabaseHeaders,
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

          supaRes = await fetch(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
            method: 'PATCH',
            headers: supabaseHeaders,
            body: JSON.stringify(patchBody)
          });
        } else {
          // 新規作成
          console.log(`[finalize] Creating new guild settings for ${guildId}`);
          supaRes = await fetch(`${supabaseRestUrl}/rest/v1/guild_settings`, {
            method: 'POST',
            headers: supabaseHeaders,
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
        
        const defaultSettings = {
          recruit_channel: null,
          notification_role: null,
          defaultTitle: "参加者募集",
          defaultColor: "#00FFFF",
          update_channel: null
        };

        const supabaseRestUrl = resolveSupabaseRestUrl(env);
        if (!supabaseRestUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
          console.warn('[guild-settings:get] Supabase not configured, returning defaults');
          return new Response(JSON.stringify(defaultSettings), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const supabaseHeaders = {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        };

        // Supabaseから設定を取得
        const supaRes = await fetch(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'GET',
          headers: supabaseHeaders,
        });
        
        if (!supaRes.ok) {
          throw new Error(`Supabase fetch failed: ${supaRes.status}`);
        }
        
        const data = await supaRes.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          // 設定が見つからない場合はデフォルト値を返す
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
  try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, error, { path: '/api/guild-settings/*' }, ctx)); else sendToSentry(env, error, { path: '/api/guild-settings/*' }); } catch(e){}
        
        // エラー時はデフォルト値を返す
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

        // Helper: fetch with timeout
        const fetchWithTimeout = async (resource, options = {}, ms = 8000) => {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), ms);
          options.signal = controller.signal;
          try {
            const res = await fetch(resource, options);
            clearTimeout(id);
            return res;
          } catch (err) {
            clearTimeout(id);
            throw err;
          }
        };

        // reCAPTCHA v3 検証（設定されている場合）
        const scoreThreshold = parseFloat(env.RECAPTCHA_SCORE_THRESHOLD || '0.5');
        if (env.RECAPTCHA_SECRET) {
          if (!recaptchaToken) {
            // Record to Sentry that client didn't send recaptcha token (helpful for diagnosing client-side failures)
            try {
              const extra = { path: '/api/support', stage: 'missing_recaptcha', requestInfo: { url: request.url, method: request.method, ip: request.headers.get('CF-Connecting-IP') || undefined } };
              if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, new Error('recaptchaToken missing'), extra, ctx)); else sendToSentry(env, new Error('recaptchaToken missing'), extra);
            } catch (e) {}
            return new Response(JSON.stringify({ error: 'reCAPTCHA token が必要です' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const params = new URLSearchParams();
          params.append('secret', env.RECAPTCHA_SECRET);
          params.append('response', recaptchaToken);
          let verifyRes;
          try {
            verifyRes = await fetchWithTimeout('https://www.google.com/recaptcha/api/siteverify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString()
            }, 8000);
          } catch (err) {
            console.error('reCAPTCHA verify fetch failed', err);
            try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, err, { path: '/api/support', stage: 'recaptcha_fetch', requestInfo: { url: request.url, method: request.method } }, ctx)); else sendToSentry(env, err, { path: '/api/support', stage: 'recaptcha_fetch', requestInfo: { url: request.url, method: request.method } }); } catch(e){}
            return new Response(JSON.stringify({ error: 'reCAPTCHA サービスへの接続に失敗しました' }), {
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const verifyJson = await verifyRes.json();
          const success = verifyJson.success;
          const score = typeof verifyJson.score === 'number' ? verifyJson.score : Number(verifyJson.score || 0);

          if (!success || score < scoreThreshold) {
            try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, new Error('reCAPTCHA failed'), { path: '/api/support', recaptcha: verifyJson, requestInfo: { url: request.url, method: request.method } }, ctx)); else sendToSentry(env, new Error('reCAPTCHA failed'), { path: '/api/support', recaptcha: verifyJson }); } catch(e){}
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
              to: [{ email: env.SUPPORT_EMAIL || 'support@recrubo.net' }],
              dkim_domain: 'recrubo.net',
              dkim_selector: 'mailchannels',
            }
          ],
          from: {
            email: 'noreply@recrubo.net',
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

        let emailRes;
        try {
          const mcHeaders = { 'Content-Type': 'application/json' };
          // If a MailChannels API key is provided, include it as a Bearer token
          if (env.MAILCHANNELS_API_KEY) {
            mcHeaders['Authorization'] = `Bearer ${env.MAILCHANNELS_API_KEY}`;
          }

          emailRes = await fetchWithTimeout('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: mcHeaders,
            body: JSON.stringify(payload),
          }, 10000);
        } catch (err) {
          console.error('MailChannels fetch failed', err);
          try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, err, { path: '/api/support', stage: 'mailchannels_fetch', requestInfo: { url: request.url, method: request.method } }, ctx)); else sendToSentry(env, err, { path: '/api/support', stage: 'mailchannels_fetch' }); } catch(e){}
          return new Response(JSON.stringify({ error: 'メール送信サービスへの接続に失敗しました' }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Safely read response body for debugging (don't throw)
        let emailBodyText = '';
        try { emailBodyText = await emailRes.clone().text(); } catch (e) { emailBodyText = `unable to read body: ${e.message}`; }

        const emailOk = emailRes && (typeof emailRes.ok === 'boolean' ? emailRes.ok : true);

        // メール送信が成功したら Discord に短い通知を送る（webhook が設定されている場合のみ）
        if (emailOk) {
          if (env.DISCORD_WEBHOOK_URL) {
            try {
              const body = { content: '📬 お問い合わせメールが届きました。' };
              const discordRes = await fetchWithTimeout(env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
              }, 3000);
              if (!discordRes.ok) {
                let discordText = '';
                try { discordText = await discordRes.text(); } catch (e) { discordText = `<body-read-error: ${e.message}>`; }
                console.warn('Discord notify returned non-ok status', discordRes.status, discordText);
              }
            } catch (e) {
              console.warn('Discord notify failed', e);
              try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, e, { path: '/api/support', stage: 'discord_notify', requestInfo: { url: request.url, method: request.method } }, ctx)); else sendToSentry(env, e, { path: '/api/support', stage: 'discord_notify' }); } catch(e){}
            }
          }

          return new Response(JSON.stringify({ success: true, message: 'お問い合わせを受け付けました。ありがとうございます！' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // If email send failed, include response details in logs/Sentry for diagnosis
  const sendError = new Error('Support send failed (MailChannels)');
  const sendContext = { emailOk, emailStatus: emailRes && emailRes.status, emailBodyText };
  console.error('Support send failed', sendContext, 'MailChannels response body:', emailBodyText);
  try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, sendError, { path: '/api/support', ...sendContext, requestInfo: { url: request.url, method: request.method } }, ctx)); else sendToSentry(env, sendError, { path: '/api/support', ...sendContext }); } catch (e) {}

        // In debug mode include body text in response to help local troubleshooting. Don't leak secrets.
        const debugMode = !!env.DEBUG || env.NODE_ENV === 'development';
        const respBody = debugMode ? { error: '送信に失敗しました', details: sendContext } : { error: '送信に失敗しました' };

        return new Response(JSON.stringify(respBody), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('Support API error:', error);
        // send minimal event to Sentry if configured
  try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(sendToSentry(env, error, { path: '/api/support', requestInfo: { url: request.url, method: request.method } }, ctx)); else sendToSentry(env, error, { path: '/api/support' }); } catch(e){}
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