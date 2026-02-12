// JWT library (install: npm install jsonwebtoken)
// For Worker environment, use: npm install @tsndr/cloudflare-worker-jwt
// import jwt from '@tsndr/cloudflare-worker-jwt';
import { resolveSupabaseRestUrl } from './supabase.js';
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

  // TTL設定値を取得
  getTtlSettings() {
    const ttlHours = Number(this.env.RECRUITS_TTL_HOURS || 8);
    const closedRetentionHours = Number(this.env.RECRUITS_CLOSED_RETENTION_HOURS || 5);
    return {
      ttlMs: ttlHours * 3600 * 1000,
      closedMs: closedRetentionHours * 3600 * 1000
    };
  }

  // 期限切れの募集IDを検索
  findExpiredRecruits(store, now) {
    const expiredIds = [];
    for (const id of Object.keys(store.items)) {
      const rec = store.items[id];
      const exp = rec?.expiresAt ? Date.parse(rec.expiresAt) : 0;
      if (exp && exp <= now) {
        expiredIds.push(id);
      }
    }
    return expiredIds;
  }

  // 期限切れアイテムを削除
  deleteExpiredRecruits(store, idsToDelete) {
    for (const id of idsToDelete) {
      delete store.items[id];
      const idx = store.list.indexOf(id);
      if (idx >= 0) store.list.splice(idx, 1);
    }
  }

  // 履歴イベントをプルーニング
  isEventValid(ev, ttlMs, closedMs, now) {
    const snap = ev && ev.snapshot ? ev.snapshot : null;
    const status = String(snap?.status || 'recruiting');
    const keepWindow = status === 'recruiting' ? ttlMs : closedMs;
    return ev.ts && (now - ev.ts) <= keepWindow;
  }

  updateHistoryForId(store, id, events, ttlMs, closedMs, now) {
    const arr = Array.isArray(events) ? events : [];
    const pruned = arr.filter((ev) => this.isEventValid(ev, ttlMs, closedMs, now));
    if (pruned.length) {
      store.history[id] = pruned;
    } else {
      delete store.history[id];
    }
  }

  pruneHistoryEvents(store, ttlMs, closedMs, now) {
    store.history = store.history || {};
    for (const [id, events] of Object.entries(store.history)) {
      this.updateHistoryForId(store, id, events, ttlMs, closedMs, now);
    }
  }

  // 期限切れエントリを削除
  cleanup(store) {
    const now = Date.now();
    const { ttlMs, closedMs } = this.getTtlSettings();
    
    const expiredIds = this.findExpiredRecruits(store, now);
    if (expiredIds.length) {
      this.deleteExpiredRecruits(store, expiredIds);
    }

    this.pruneHistoryEvents(store, ttlMs, closedMs, now);
  }

  addHistory(store, id, type, snapshot) {
    store.history = store.history || {};
    const arr = store.history[id] || [];
    arr.push({ ts: Date.now(), type, snapshot });
    // keep last 200 events per id to cap growth
    if (arr.length > 200) arr.splice(0, arr.length - 200);
    store.history[id] = arr;
  }

  handleGetList(store) {
    const result = store.list.map((id) => store.items[id]).filter(Boolean);
    return new Response(JSON.stringify({ items: result }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  handleGetRecruit(store, id) {
    const rec = store.items[id];
    if (!rec) {
      return new Response(JSON.stringify({ error: 'not_found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    return new Response(JSON.stringify(rec), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  handleGetHistory(store, id, request) {
    const params = new URL(request.url).searchParams;
    const fromMs = params.get('from') ? Date.parse(params.get('from')) : 0;
    const toMs = params.get('to') ? Date.parse(params.get('to')) : Date.now();
    const events = (store.history?.[id] || []).filter(ev => ev.ts >= fromMs && ev.ts <= toMs);
    return new Response(JSON.stringify({ id, events }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  updateRecruitFields(rec, update) {
    const allowed = ['title','description','game','platform','status','maxMembers','voice','metadata','expiresAt','closedAt'];
    for (const k of allowed) {
      if (k in update) rec[k] = k === 'maxMembers' ? Number(update[k]) : update[k];
    }
  }

  updateRecruitExpiration(rec, update) {
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
  }

  async handlePatchRecruit(store, id, request) {
    const update = await safeReadJson(request);
    const rec = store.items[id];
    if (!rec) {
      return new Response(JSON.stringify({ error: 'not_found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    this.updateRecruitFields(rec, update);
    this.updateRecruitExpiration(rec, update);

    store.items[id] = rec;
    this.addHistory(store, id, 'update', { ...rec });
    await this.saveStore(store);
    return new Response(JSON.stringify({ ok: true, recruit: rec }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  async handleDeleteRecruit(store, id, request) {
    const body = await safeReadJson(request);
    const requester = body?.userId || body?.ownerId;
    const rec = store.items[id];
    if (!rec) {
      return new Response(JSON.stringify({ error: 'not_found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const isOwner = requester && String(requester) === String(rec.ownerId);
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { 
        status: 403, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    delete store.items[id];
    const idx = store.list.indexOf(id);
    if (idx >= 0) store.list.splice(idx, 1);
    this.addHistory(store, id, 'delete', { id, deletedAt: new Date().toISOString() });
    await this.saveStore(store);
    return new Response(JSON.stringify({ ok: true, deleted: id }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  async handleJoin(store, id, request) {
    const body = await safeReadJson(request);
    const userId = body?.userId || body?.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id_required' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const rec = store.items[id];
    if (!rec) {
      return new Response(JSON.stringify({ error: 'not_found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    if (!rec.participants) rec.participants = [];
    if (!rec.participants.includes(userId)) {
      rec.participants.push(userId);
      this.addHistory(store, id, 'join', { userId, joinedAt: new Date().toISOString() });
      await this.saveStore(store);
    }
    return new Response(JSON.stringify({ ok: true, joined: userId }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  extractRecruitId(data) {
    return (data?.recruitId || data?.id || '').toString();
  }

  extractOwnerId(data) {
    return (data?.ownerId || data?.owner_id || '').toString();
  }

  extractTitle(data) {
    return (data?.title || '').toString();
  }

  extractDescription(data) {
    return (data?.description || data?.content || '').toString();
  }

  extractGame(data) {
    return (data?.game || '').toString();
  }

  extractPlatform(data) {
    return (data?.platform || '').toString();
  }

  calculateExpiresAt(data) {
    if (data?.expiresAt) return data.expiresAt;
    const ttlHours = Number(this.env.RECRUITS_TTL_HOURS || 8);
    const now = new Date();
    return new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();
  }

  extractStartTime(data) {
    return data?.startTime || new Date().toISOString();
  }

  extractMaxMembers(data) {
    return Number(data?.maxMembers || 0) || undefined;
  }

  extractVoice(data) {
    return Boolean(data?.voice);
  }

  extractParticipants(data) {
    return Array.isArray(data?.participants) ? data.participants.slice(0, 100) : [];
  }

  extractCreatedAt(data) {
    return data?.createdAt || new Date().toISOString();
  }

  extractStatus(data) {
    return (data?.status || 'recruiting').toString();
  }

  extractMetadata(data) {
    return data?.metadata || {};
  }

  buildRecruitRecord(data) {
    const recruitId = this.extractRecruitId(data);
    const ownerId = this.extractOwnerId(data);

    return {
      id: recruitId,
      recruitId,
      ownerId,
      title: this.extractTitle(data),
      description: this.extractDescription(data),
      game: this.extractGame(data),
      platform: this.extractPlatform(data),
      startTime: this.extractStartTime(data),
      maxMembers: this.extractMaxMembers(data),
      voice: this.extractVoice(data),
      participants: this.extractParticipants(data),
      createdAt: this.extractCreatedAt(data),
      expiresAt: this.calculateExpiresAt(data),
      status: this.extractStatus(data),
      metadata: this.extractMetadata(data)
    };
  }

  validateRecruitIds(recruitId, ownerId) {
    if (!recruitId || !ownerId) {
      return new Response(JSON.stringify({ error: 'recruitId_and_ownerId_required' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    return null;
  }

  addRecruitToStore(store, recruitId, record) {
    store.items[recruitId] = record;
    if (!store.list.includes(recruitId)) {
      store.list.unshift(recruitId);
    }
  }

  createSuccessResponse(recruitId) {
    return new Response(JSON.stringify({ ok: true, recruitId }), { 
      status: 201, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  async handleCreateRecruit(store, request) {
    const data = await safeReadJson(request);
    const recruitId = this.extractRecruitId(data);
    const ownerId = this.extractOwnerId(data);
    
    const validationError = this.validateRecruitIds(recruitId, ownerId);
    if (validationError) return validationError;

    const record = this.buildRecruitRecord(data);
    this.addRecruitToStore(store, recruitId, record);
    this.addHistory(store, recruitId, 'create', { ...record });
    await this.saveStore(store);
    return this.createSuccessResponse(recruitId);
  }

  parseTimestampFromUrl(url) {
    return url.searchParams.get('ts') ? Date.parse(url.searchParams.get('ts')) : Date.now();
  }

  getRecruitIdsForQuery(store, idFilter) {
    return idFilter ? [idFilter] : Array.from(new Set([...(store.list||[]), ...Object.keys(store.history||{})]));
  }

  findSnapshotAtTime(store, id, ts) {
    const arr = (store.history?.[id] || []).filter(ev => ev.ts <= ts);
    if (!arr.length) return null;
    const last = arr[arr.length-1];
    return (last && last.snapshot) ? last.snapshot : null;
  }

  buildRecruitsAtResponse(items) {
    return new Response(JSON.stringify({ items }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  handleGetRecruitsAt(store, url) {
    const ts = this.parseTimestampFromUrl(url);
    const idFilter = url.searchParams.get('id');
    const ids = this.getRecruitIdsForQuery(store, idFilter);
    const result = [];
    
    for (const id of ids) {
      const snapshot = this.findSnapshotAtTime(store, id, ts);
      if (snapshot) result.push(snapshot);
    }
    
    return this.buildRecruitsAtResponse(result);
  }

  // ルートパスとIDをパース
  parseRecruitPath(pathname) {
    const match = pathname.match(/^\/api\/recruits\/(.+?)(?:\/(join|history))?$/);
    if (!match) return null;
    return {
      id: decodeURIComponent(match[1]),
      action: match[2] || ''
    };
  }

  // 基本ルートかチェック
  isBaseRoute(pathname, method, targetPath, targetMethod) {
    return pathname === targetPath && method === targetMethod;
  }

  // IDパスのルーティング
  async handleIdRoute(store, id, action, method, request) {
    if (method === 'GET') {
      return this.handleIdRouteGet(store, id, action, request);
    }
    if (method === 'PATCH' && !action) {
      return await this.handlePatchRecruit(store, id, request);
    }
    if (method === 'DELETE' && !action) {
      return await this.handleDeleteRecruit(store, id, request);
    }
    if (method === 'POST' && action === 'join') {
      return await this.handleJoin(store, id, request);
    }
    return null;
  }

  handleIdRouteGet(store, id, action, request) {
    if (!action) {
      return this.handleGetRecruit(store, id);
    }
    if (action === 'history') {
      return this.handleGetHistory(store, id, request);
    }
    return null;
  }

  // fetch リクエストハンドラー
  async fetch(request) {
    const url = new URL(request.url);
    const base = '/api/recruits';
    const method = request.method.toUpperCase();

    let store = await this.loadStore();
    this.cleanup(store);

    // 基本ルート
    if (this.isBaseRoute(url.pathname, method, base, 'GET')) {
      return this.handleGetList(store);
    }
    if (this.isBaseRoute(url.pathname, method, '/api/recruits-at', 'GET')) {
      return this.handleGetRecruitsAt(store, url);
    }
    if (this.isBaseRoute(url.pathname, method, base, 'POST')) {
      return await this.handleCreateRecruit(store, request);
    }

    // IDパス
    const parsedPath = this.parseRecruitPath(url.pathname);
    if (parsedPath) {
      const result = await this.handleIdRoute(
        store, 
        parsedPath.id, 
        parsedPath.action, 
        method, 
        request
      );
      if (result) return result;
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' } 
    });
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
    const m = url.pathname.match(/^\/do\/invite-token\/([A-Za-z0-9_-]+)\/consume$/);
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

function handlePreflight(corsHeaders) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

function isPublicPath(pathname) {
  const skipTokenPaths = [
    '/api/test',
    '/api/discord/callback',
    '/api/dashboard',
    '/api/support',
    '/metrics',
    '/api/grafana/recruits',
    '/api/bot-invite'
  ];
  return skipTokenPaths.some(path => pathname.startsWith(path));
}

function requiresServiceToken(pathname) {
  const isApiPath = pathname.startsWith('/api');
  return isApiPath && !isPublicPath(pathname);
}

function extractServiceToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  const serviceTokenHeader = request.headers.get('x-service-token') || '';
  
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  
  if (serviceTokenHeader) {
    return serviceTokenHeader.trim();
  }
  
  return '';
}

function validateServiceToken(request, env, url) {
  const SERVICE_TOKEN = env.SERVICE_TOKEN || '';
  
  if (!requiresServiceToken(url.pathname)) {
    return { valid: true };
  }
  
  if (!SERVICE_TOKEN) {
    return { valid: true };
  }
  
  const token = extractServiceToken(request);
  
  if (!token || token !== SERVICE_TOKEN) {
    console.warn(`[Auth] Unauthorized access attempt to ${url.pathname}`);
    return { valid: false };
  }
  
  return { valid: true };
}

function buildEnvLiteResponse(env, corsHeaders) {
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
    if (typeof val === 'string' && val.trim() !== '') {
      selectedSource = name;
      break;
    }
  }

  let host = null;
  if (resolvedUrl) {
    try { host = new URL(resolvedUrl).host; } catch {}
  }

  const responseBody = {
    ok: true,
    supabase: {
      configured: !!resolvedUrl,
      source: selectedSource,
      host,
      preview: resolvedUrl ? (resolvedUrl.substring(0, 32) + '...') : null
    },
    serviceRoleKeyConfigured: !!env.SUPABASE_SERVICE_ROLE_KEY,
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function handleDebugEnvLite(env, corsHeaders) {
  return buildEnvLiteResponse(env, corsHeaders);
}

function handleTestEndpoint(url, corsHeaders) {
  return new Response(JSON.stringify({
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
    path: url.pathname,
    method: 'GET'
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function tryAuthRoute(params) {
  if (params.url.pathname === '/api/debug/env-lite') return null;
  return await routeAuth(params);
}

async function tryBotInviteRoute(params) {
  console.log('[worker] Attempting routeBotInvite for:', params.url.pathname);
  const result = await routeBotInvite(params);
  if (result) {
    console.log('[worker] routeBotInvite returned response');
  } else {
    console.log('[worker] routeBotInvite returned null');
  }
  return result;
}

async function tryRoutes(params) {
  const { request, env, ctx, url, corsHeaders, sendToSentry } = params;
  
  const routeParams = { request, env, ctx, url, corsHeaders };
  
  return await tryAuthRoute(routeParams)
    || await routeAdmin(routeParams)
    || await routeGuildSettings(routeParams)
    || await routeRecruitment({ ...routeParams, sendToSentry })
    || await tryBotInviteRoute(routeParams)
    || await routeProxy(routeParams)
    || await routeLogs(routeParams)
    || null;
}

// (Auth/JWT helpers and Discord OAuth moved to utils/auth.js and utils/discordOAuth.js)

function handleDebugEndpoints(url, request, env, corsHeaders) {
  if (url.pathname === '/api/debug/env-lite' && request.method === 'GET') {
    return handleDebugEnvLite(env, corsHeaders);
  }
  if (url.pathname === '/api/test' && request.method === 'GET') {
    return handleTestEndpoint(url, corsHeaders);
  }
  return null;
}

function handleUnauthorized(corsHeaders) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env, ctx) {
    console.log(`Worker request: ${request.method} ${request.url}`);
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handlePreflight(corsHeaders);
    }

    // Validate service token for protected routes
    const tokenValidation = validateServiceToken(request, env, url);
    if (!tokenValidation.valid) {
      return handleUnauthorized(corsHeaders);
    }

    // Handle debug endpoints
    const debugResult = handleDebugEndpoints(url, request, env, corsHeaders);
    if (debugResult) return debugResult;

    // Try all route handlers
    const routeResult = await tryRoutes({ request, env, ctx, url, corsHeaders, sendToSentry });
    if (routeResult) return routeResult;

    // 404 for unmatched routes
    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders
    });
  },
};