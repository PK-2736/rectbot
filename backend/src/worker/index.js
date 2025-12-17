// JWT library (install: npm install jsonwebtoken)
// For Worker environment, use: npm install @tsndr/cloudflare-worker-jwt
// import jwt from '@tsndr/cloudflare-worker-jwt';
import { resolveSupabaseRestUrl, getSupabaseClient, pingSupabase, buildSupabaseHeaders } from './supabase.js';
import { routeGuildSettings } from './routes/guildSettings.js';
import { routeRecruitment } from './routes/recruitment.js';
import { getCorsHeaders } from './utils/cors.js';
import { routeAuth } from './routes/auth.js';
import { routeAdmin } from './routes/admin.js';
import { routeLogs } from './routes/logs.js';
import { routeProxy } from './routes/proxy.js';
import { routeBotInvite } from './routes/botInvite.js';
import { sendToSentry } from './utils/sentry.js';

// ----- Sentry minimal HTTP reporter for Cloudflare Worker when @sentry/cloudflare isn't used -----
// Durable Object: RecruitsDO (singleton) for ephemeral recruitment cache with TTL
export class RecruitsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async loadStore() {
    const store = await this.state.storage.get('recruits');
    return store || { items: {}, list: [], history: {} }; // items: { [id]: data }, list: [id], history: { [id]: Array<{ts:number,type:string,snapshot:any}> }
  }

  async saveStore(store) {
    await this.state.storage.put('recruits', store);
  }

  // Remove expired entries lazily
  cleanup(store) {
    const now = Date.now();
    const ttlHours = Number(this.env.RECRUITS_TTL_HOURS || 8);
    const closedRetentionHours = Number(this.env.RECRUITS_CLOSED_RETENTION_HOURS || 5);
    const ttlMs = ttlHours * 3600 * 1000;
    const closedMs = closedRetentionHours * 3600 * 1000;
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

    // prune history
    store.history = store.history || {};
    for (const [id, events] of Object.entries(store.history)) {
      const arr = Array.isArray(events) ? events : [];
      const pruned = arr.filter((ev) => {
        const snap = ev && ev.snapshot ? ev.snapshot : null;
        const status = String(snap?.status || 'recruiting');
        const keepWindow = status === 'recruiting' ? ttlMs : closedMs;
        return ev.ts && (now - ev.ts) <= keepWindow;
      });
      if (pruned.length) {
        store.history[id] = pruned;
      } else {
        delete store.history[id];
      }
    }
  }

  addHistory(store, id, type, snapshot) {
    store.history = store.history || {};
    const arr = store.history[id] || [];
    arr.push({ ts: Date.now(), type, snapshot });
    // keep last 200 events per id to cap growth
    if (arr.length > 200) arr.splice(0, arr.length - 200);
    store.history[id] = arr;
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

      // GET /api/recruits/:id/history?from=iso&to=iso
      if (method === 'GET' && action === '') {
        // handled above
      }

      if (method === 'GET' && action === 'history') {
        const params = new URL(request.url).searchParams;
        const fromMs = params.get('from') ? Date.parse(params.get('from')) : 0;
        const toMs = params.get('to') ? Date.parse(params.get('to')) : Date.now();
        const events = (store.history?.[id] || []).filter(ev => ev.ts >= fromMs && ev.ts <= toMs);
        return new Response(JSON.stringify({ id, events }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (method === 'PATCH' && !action) {
        const update = await safeReadJson(request);
        const rec = store.items[id];
        if (!rec) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        // update selected fields
        const allowed = ['title','description','game','platform','status','maxMembers','voice','metadata','expiresAt','closedAt'];
        for (const k of allowed) {
          if (k in update) rec[k] = k === 'maxMembers' ? Number(update[k]) : update[k];
        }

        // If status becomes non-recruiting, set closedAt (if missing) and extend expiresAt to retention window
        try {
          const closedRetentionHours = Number(this.env.RECRUITS_CLOSED_RETENTION_HOURS || 5);
          const now = new Date();
          const wasRecruiting = String(rec.status || 'recruiting') === 'recruiting';
          const willRecruiting = String(update.status ?? rec.status ?? 'recruiting') === 'recruiting';
          if (wasRecruiting && !willRecruiting) {
            if (!rec.closedAt) rec.closedAt = now.toISOString();
            const exp = new Date(now.getTime() + closedRetentionHours * 3600 * 1000);
            rec.expiresAt = exp.toISOString();
          }
        } catch (_) {}

        store.items[id] = rec;
        this.addHistory(store, id, 'update', { ...rec });
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
        this.addHistory(store, id, 'delete', { id, deletedAt: new Date().toISOString() });
        await this.saveStore(store);
        return new Response(JSON.stringify({ ok: true, deleted: id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'join' && method === 'POST') {
        const body = await safeReadJson(request);
        const userId = body?.userId || body?.user_id;
        if (!userId) return new Response(JSON.stringify({ error: 'user_id_required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        const rec = store.items[id];
        if (!rec) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        if (!rec.participants) rec.participants = [];
        if (!rec.participants.includes(userId)) {
          rec.participants.push(userId);
          this.addHistory(store, id, 'join', { userId, joinedAt: new Date().toISOString() });
          await this.saveStore(store);
        }
        return new Response(JSON.stringify({ ok: true, joined: userId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
        
      out.sort((a,b)=>a.ts-b.ts);
      return new Response(JSON.stringify({ events: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (method === 'GET' && urlObj.pathname === '/api/recruits-at') {
      const ts = urlObj.searchParams.get('ts') ? Date.parse(urlObj.searchParams.get('ts')) : Date.now();
      const idFilter = urlObj.searchParams.get('id');
      const result = [];
      const ids = idFilter ? [idFilter] : Array.from(new Set([...(store.list||[]), ...Object.keys(store.history||{})]));
      for (const id of ids) {
        const arr = (store.history?.[id] || []).filter(ev => ev.ts <= ts);
        if (!arr.length) continue;
        const last = arr[arr.length-1];
        if (last && last.snapshot) result.push(last.snapshot);
      }
      return new Response(JSON.stringify({ items: result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}
}

// Durable Object: InviteTokensDO for one-time bot invite links
export class InviteTokensDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async loadStore() {
    const store = await this.state.storage.get('tokens');
    return store || { items: {} }; // items: { [token]: { used:boolean, createdAt:string } }
  }

  async saveStore(store) {
    await this.state.storage.put('tokens', store);
  }

  cleanup(store) {
    const now = Date.now();
    const ttlSec = Number(this.env.ONE_TIME_INVITE_TTL_SEC || 600);
    const expMs = ttlSec * 1000;
    const items = store.items || {};
    for (const [token, meta] of Object.entries(items)) {
      const t = new Date(meta.createdAt || 0).getTime();
      if (!t || (now - t) > expMs) {
        delete items[token];
      }
    }
    store.items = items;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    let store = await this.loadStore();
    this.cleanup(store);

    // Create token: POST /do/invite-token
    if (method === 'POST' && url.pathname === '/do/invite-token') {
      const token = crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2, 10);
      store.items[token] = { used: false, createdAt: new Date().toISOString() };
      await this.saveStore(store);
      return new Response(JSON.stringify({ ok: true, token }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Consume token: POST /do/invite-token/:token/consume
    const m = url.pathname.match(/^\/do\/invite-token\/([A-Za-z0-9_\-]+)\/consume$/);
    if (method === 'POST' && m) {
      const token = m[1];
      const meta = store.items[token];
      if (!meta) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      if (meta.used) return new Response(JSON.stringify({ ok: false, error: 'used' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
      meta.used = true;
      store.items[token] = meta;
      await this.saveStore(store);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

// (Auth/JWT helpers and Discord OAuth moved to utils/auth.js and utils/discordOAuth.js)

export default {
  async fetch(request, env, ctx) {
    console.log(`Worker request: ${request.method} ${request.url}`);
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

    // Delegate: Auth and debug endpoints (except env-lite which remains gated below)
    if (url.pathname !== '/api/debug/env-lite') {
      const routedAuth = await routeAuth(request, env, ctx, url, corsHeaders);
      if (routedAuth) return routedAuth;
    }

    // Delegate: Admin endpoints (JWT cookie-based)
    {
      const routedAdmin = await routeAdmin(request, env, ctx, url, corsHeaders);
      if (routedAdmin) return routedAdmin;
    }

    // Service Token 認証
    const SERVICE_TOKEN = env.SERVICE_TOKEN || '';
    const isApiPath = url.pathname.startsWith('/api');
    // Paths that do not require SERVICE_TOKEN header (public endpoints)
    const skipTokenPaths = [
      '/api/test',
      '/api/discord/callback',
      '/api/dashboard',
      '/api/support',
      '/metrics',
      '/api/grafana/recruits',
      // One-time bot invite wrapper is public (GET only)
      '/api/bot-invite/t/',
      // One-time bot invite token creation (public POST)
      '/api/bot-invite/one-time'
    ];
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

    // Guild settings routes (split)
    {
      const routed = await routeGuildSettings(request, env, ctx, url, corsHeaders);
      if (routed) return routed;
    }

    // Recruitment, DO proxy, Grafana routes (split)
    {
      const routed = await routeRecruitment(request, env, ctx, url, corsHeaders, sendToSentry);
      if (routed) return routed;
    }

    // Delegate: One-Time Bot Invite endpoints
    {
      console.log('[worker] Attempting routeBotInvite for:', url.pathname);
      const routedInvite = await routeBotInvite(request, env, ctx, url, corsHeaders);
      if (routedInvite) {
        console.log('[worker] routeBotInvite returned response');
        return routedInvite;
      }
      console.log('[worker] routeBotInvite returned null');
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

  // Recruitment-related routes moved to routes/recruitment.js

    // Delegate: Proxy (images)
    {
      const routedProxy = await routeProxy(request, env, ctx, url, corsHeaders);
      if (routedProxy) return routedProxy;
    }


    // Delegate: Logs (Cloudflare -> Loki)
    {
      const routedLogs = await routeLogs(request, env, ctx, url, corsHeaders);
      if (routedLogs) return routedLogs;
    }

    // (recruitment routes handled above)

    // (moved) /api/guild-settings/finalize handled by routeGuildSettings

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

    // ギルド設定取得APIは routes/guildSettings.js で処理（ここでは何もしない）

    // すべてのルートにマッチしなかった場合の404レスポンス
    return new Response("Not Found", { 
      status: 404, 
      headers: corsHeaders 
    });
  },
};