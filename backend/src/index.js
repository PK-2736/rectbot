// Worker unified API - minimal self-contained implementation
// - Uses Durable Object if bound (env.RECRUITS_DO), otherwise in-memory fallback (non-persistent)
// - CORS origins via CORS_ORIGINS env (comma separated)
// - Write ops require Authorization: Bearer <SERVICE_TOKEN>

// Friend Code Worker routes
import { handleNormalizeGameName } from './routes/friend-code/normalizeGameName';
import { handleAddFriendCode } from './routes/friend-code/addFriendCode';
import { handleGetFriendCodes } from './routes/friend-code/getFriendCodes';
import { handleDeleteFriendCode } from './routes/friend-code/deleteFriendCode';
import { handleSearchGameNames } from './routes/friend-code/searchGameNames';
import { validateFriendCode } from './routes/friend-code/validateFriendCode';
import { generateGameEmbeddings } from './utils/gameEmbeddings';
import { resolveSupabaseRestUrl, buildSupabaseHeaders } from './worker/supabase.js';

function parseOrigins(env) {
  const raw = env.CORS_ORIGINS || 'https://recrubo.net,https://www.recrubo.net,https://dash.recrubo.net,https://grafana.recrubo.net';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeadersFor(origin, env) {
  const allowed = parseOrigins(env);
  // セキュリティ: Access-Control-Allow-Credentials: true と * の併用は禁止
  // 許可されたOriginのみ明示的に返す。不明なOriginは拒否。
  if (!origin || !allowed.includes(origin)) {
    return null; // 不正なOriginの場合はnullを返す
  }
  return {
    'Access-Control-Allow-Origin': origin, // 必ず実際のOriginを返す（* は禁止）
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-token',
    'Access-Control-Allow-Credentials': 'true'
  };
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

async function verifyServiceToken(request, env) {
  const svc = env.SERVICE_TOKEN || '';
  if (!svc) return false;
  const auth = request.headers.get('authorization') || '';
  const xt = request.headers.get('x-service-token') || '';
  let token = '';
  if (xt) token = xt.trim();
  else if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
  return token && token === svc;
}

// Minimal storage abstraction: prefer Durable Object if bound, else in-memory Map (non-persistent)
function createInMemoryStore() {
  const map = new Map();
  const list = [];
  return {
    async listAll() {
      return list.map(id => map.get(id));
    },
    async get(id) {
      return map.get(id) || null;
    },
    async create(payload) {
      const id = payload.recruitId || crypto.randomUUID();
      const now = Date.now();
      const item = {
        ...payload,
        recruitId: id,
        createdAt: now,
        expiresAt: payload.expiresAt || now + 8 * 3600 * 1000
      };
      map.set(id, item);
      if (!list.includes(id)) list.push(id);
      return item;
    },
    async join(id, userId) {
      const r = map.get(id);
      if (!r) return null;
      r.currentMembers = Array.isArray(r.currentMembers) ? r.currentMembers : [];
      if (!r.currentMembers.includes(userId)) {
        if (r.maxMembers && r.currentMembers.length >= r.maxMembers) {
          throw new Error('full');
        }
        r.currentMembers.push(userId);
        map.set(id, r);
      }
      return r;
    },
    async delete(id, requesterId) {
      const r = map.get(id);
      if (!r) return null;
      if (r.ownerId && requesterId && r.ownerId !== requesterId) {
        throw new Error('forbidden');
      }
      map.delete(id);
      const idx = list.indexOf(id);
      if (idx !== -1) list.splice(idx, 1);
      return true;
    }
  };
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeadersFor(origin, env);

    // セキュリティ: 不正なOriginからのOPTIONSリクエストは拒否
    if (request.method === 'OPTIONS') {
      if (!cors) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { status: 204, headers: cors });
    }
    
    // Friend Code API: Discord Botからのリクエストを許可（Originヘッダーなし）
    const isFriendCodeAPI = url.pathname.startsWith('/api/game/') || url.pathname.startsWith('/api/friend-code/');
    
    // Bot API: Discord Botからの管理系リクエストを許可（Originヘッダーなし、SERVICE_TOKEN認証必須）
    const isBotAPI = url.pathname.startsWith('/api/guild-settings/') || 
                     url.pathname.startsWith('/api/recruitments') || 
                     url.pathname.startsWith('/api/recruitment') ||
                     url.pathname.startsWith('/api/bot-invite/');
    
    // セキュリティ: 不正なOriginからの通常リクエストも拒否（GETとFriend Code API、Bot APIは除く）
    if (!cors && request.method !== 'GET' && !isFriendCodeAPI && !isBotAPI) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // GETリクエストで不正なOriginの場合はCORSヘッダーなしで応答（後方互換性のため）
    const safeHeaders = cors || {};

    // health
    if (url.pathname === '/ping' || url.pathname === '/health') {
      return jsonResponse({ ok: true, name: 'recrubo-api', status: 'ok' }, 200, safeHeaders);
    }

    // Friend Code API Routes
    if (url.pathname === '/api/game/normalize' && request.method === 'POST') {
      return await handleNormalizeGameName(request, env, safeHeaders);
    }

    if (url.pathname === '/api/friend-code/add' && request.method === 'POST') {
      return await handleAddFriendCode(request, env, safeHeaders);
    }

    if (url.pathname === '/api/friend-code/get' && request.method === 'GET') {
      return await handleGetFriendCodes(request, env, safeHeaders);
    }

    if (url.pathname === '/api/friend-code/delete' && request.method === 'DELETE') {
      return await handleDeleteFriendCode(request, env, safeHeaders);
    }

    if (url.pathname === '/api/game/search' && request.method === 'GET') {
      return await handleSearchGameNames(request, env, safeHeaders);
    }

    if (url.pathname === '/api/friend-code/validate' && request.method === 'POST') {
      return await validateFriendCode(request, env, safeHeaders);
    }

    // Guild Settings API: Finalize guild settings (requires auth)
    if (url.pathname === '/api/guild-settings/finalize' && request.method === 'POST') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      
      try {
        const body = await request.json();
        const { guildId, notification_roles, notification_role, recruit_channel, recruit_channels, update_channel, defaultColor, defaultTitle, recruit_style, enable_dedicated_channel, dedicated_channel_category_id } = body;
        
        if (!guildId) {
          return jsonResponse({ ok: false, error: 'guildId is required' }, 400, safeHeaders);
        }

        // Normalize notification roles (single or multiple) into a single column that accepts either a single id or JSON array string
        const normalizedNotificationRoles = (() => {
          const roles = [];
          if (Array.isArray(notification_roles)) {
            roles.push(...notification_roles.filter(Boolean).map(String));
          }
          if (notification_role) {
            roles.push(String(notification_role));
          }
          return [...new Set(roles)].slice(0, 25);
        })();

        const serializedNotificationRoleId = (() => {
          if (normalizedNotificationRoles.length === 0) return null;
          if (normalizedNotificationRoles.length === 1) return normalizedNotificationRoles[0];
          try {
            return JSON.stringify(normalizedNotificationRoles);
          } catch (_err) {
            return normalizedNotificationRoles[0];
          }
        })();
        
        // Supabaseに保存
        const supabaseUrl = resolveSupabaseRestUrl(env);
        if (!supabaseUrl) {
          console.error('[Guild Settings Finalize] Supabase URL is not configured');
          return jsonResponse({ ok: false, error: 'Supabase URL is not configured' }, 500, safeHeaders);
        }
        
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error('[Guild Settings Finalize] Supabase service role key is not configured');
          return jsonResponse({ ok: false, error: 'Supabase service role key is not configured' }, 500, safeHeaders);
        }
        
        const payload = {
          guild_id: guildId,
          recruit_channel_id: recruit_channel || null,
          recruit_channel_ids: Array.isArray(recruit_channels) ? recruit_channels.filter(Boolean).map(String) : (Object.prototype.hasOwnProperty.call(body, 'recruit_channels') ? [] : undefined),
          notification_role_id: serializedNotificationRoleId,
          update_channel_id: update_channel || null,
          default_color: Object.prototype.hasOwnProperty.call(body, 'defaultColor') ? (defaultColor || null) : undefined,
          default_title: defaultTitle || '参加者募集',
          recruit_style: Object.prototype.hasOwnProperty.call(body, 'recruit_style') ? (recruit_style || null) : undefined,
          enable_dedicated_channel: Object.prototype.hasOwnProperty.call(body, 'enable_dedicated_channel') ? !!enable_dedicated_channel : undefined,
          dedicated_channel_category_id: Object.prototype.hasOwnProperty.call(body, 'dedicated_channel_category_id') ? (dedicated_channel_category_id || null) : undefined,
          updated_at: new Date().toISOString()
        };
        
        console.log('[Guild Settings Finalize] Saving to Supabase:', {
          supabaseUrl,
          guildId,
          keys: Object.keys(payload),
          notificationRoles: normalizedNotificationRoles,
          serializedNotificationRoleId
        });
        
        // Remove undefined keys to avoid accidental column creation attempts
        const supabaseBody = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));

        const response = await fetch(`${supabaseUrl}/rest/v1/guild_settings?on_conflict=guild_id`, {
          method: 'POST',
          headers: {
            ...buildSupabaseHeaders(env),
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(supabaseBody)
        });
        
        const responseText = await response.text();
        console.log('[Guild Settings Finalize] Supabase response:', { status: response.status, bodyLength: responseText.length });
        
        if (!response.ok) {
          console.error('[Guild Settings Finalize] Supabase error:', { status: response.status, body: responseText });
          return jsonResponse({ ok: false, error: `Supabase error (${response.status}): ${responseText}` }, 500, safeHeaders);
        }
        
        return jsonResponse({ ok: true }, 200, safeHeaders);
      } catch (error) {
        console.error('[Guild Settings Finalize] Error:', error);
        return jsonResponse({ ok: false, error: error.message }, 500, safeHeaders);
      }
    }

    // Guild Settings API: Get guild settings
    if (url.pathname.match(/^\/api\/guild-settings\/[^/]+$/) && request.method === 'GET') {
      const guildId = url.pathname.split('/').pop();
      
      try {
        const supabaseUrl = resolveSupabaseRestUrl(env);
        if (!supabaseUrl) {
          return jsonResponse({ ok: false, error: 'Supabase URL is not configured' }, 500, safeHeaders);
        }
        
        const response = await fetch(`${supabaseUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}&select=*`, {
          method: 'GET',
          headers: buildSupabaseHeaders(env)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Guild Settings Get] Supabase error:', errorText);
          return jsonResponse({ ok: false, error: 'Failed to get from Supabase' }, 500, safeHeaders);
        }
        
        const data = await response.json();
        if (data.length === 0) {
          return jsonResponse({}, 200, safeHeaders);
        }
        
        const settings = data[0];

        const rawNotificationRole = settings.notification_role_id;
        let notificationRoles = [];
        if (Array.isArray(rawNotificationRole)) notificationRoles = rawNotificationRole.map(String);
        else if (typeof rawNotificationRole === 'string') {
          const trimmed = rawNotificationRole.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) notificationRoles = parsed.filter(Boolean).map(String);
            } catch (_e) {}
          }
          if (notificationRoles.length === 0 && trimmed.length > 0) notificationRoles = [trimmed];
        } else if (rawNotificationRole) notificationRoles = [String(rawNotificationRole)];

        notificationRoles = [...new Set(notificationRoles)].slice(0, 25);

        const recruitChannels = Array.isArray(settings.recruit_channel_ids)
          ? settings.recruit_channel_ids.filter(Boolean).map(String)
          : [];
        const primaryRecruitChannel = settings.recruit_channel_id || (recruitChannels.length > 0 ? recruitChannels[0] : null);

        return jsonResponse({
          notification_roles: notificationRoles,
          notification_role: notificationRoles.length > 0 ? notificationRoles[0] : null,
          recruit_channel: primaryRecruitChannel || null,
          recruit_channels: recruitChannels,
          update_channel: settings.update_channel_id || null,
          defaultColor: settings.default_color || null,
          defaultTitle: settings.default_title || null,
          recruit_style: settings.recruit_style || 'image',
          enable_dedicated_channel: typeof settings.enable_dedicated_channel === 'boolean' ? settings.enable_dedicated_channel : false,
          dedicated_channel_category_id: settings.dedicated_channel_category_id || null
        }, 200, safeHeaders);
      } catch (error) {
        console.error('[Guild Settings Get] Error:', error);
        return jsonResponse({ ok: false, error: error.message }, 500, safeHeaders);
      }
    }

    // Admin endpoint: Generate game embeddings (requires auth)
    if (url.pathname === '/api/admin/generate-games' && request.method === 'POST') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      
      try {
        const result = await generateGameEmbeddings(env);
        return jsonResponse({ ok: true, ...result }, 200, safeHeaders);
      } catch (error) {
        console.error('[Generate Games Error]', error);
        return jsonResponse({ ok: false, error: error.message }, 500, safeHeaders);
      }
    }

    // storage selection (moved up before metrics endpoints)
    let store;
    if (env.RECRUITS_DO && typeof env.RECRUITS_DO.get === 'function') {
      // If a DO binding exists, delegate to its id/stub; for now call the DO stub endpoints
      const id = env.RECRUITS_DO.idFromName('global');
      const stub = env.RECRUITS_DO.get(id);
      const forwardToDO = async (path, method = 'GET', body = null, headers = {}) => {
        const req = new Request(new URL(path, request.url).toString(), {
          method,
          headers: { 'content-type': 'application/json', ...headers },
          body: body ? JSON.stringify(body) : undefined
        });
        return stub.fetch(req);
      };
      store = { forwardToDO };
    } else {
      if (!globalThis.__RECRUIT_STORE) globalThis.__RECRUIT_STORE = createInMemoryStore();
      store = globalThis.__RECRUIT_STORE;
    }

    // Prometheus metrics endpoint for Grafana
    if (url.pathname === '/metrics' && request.method === 'GET') {
      try {
        let items = [];
        if (store && store.forwardToDO) {
          const res = await store.forwardToDO('/api/recruits', 'GET');
          const data = await res.json();
          items = data.items || [];
        } else if (store) {
          items = await store.listAll();
        }
        
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
          `recruits_participants_total ${items.reduce((sum, r) => sum + (r.currentMembers?.length || r.participants?.length || 0), 0)}`
        ].join('\n');
        
        return new Response(metrics, {
          status: 200,
          headers: { 'content-type': 'text/plain; version=0.0.4', ...cors }
        });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
      }
    }

    // Grafana JSON datasource endpoints
    if ((url.pathname === '/api/grafana/recruits' || url.pathname === '/api/grafana/recruits/search') && (request.method === 'POST' || request.method === 'GET')) {
      try {
        // Check Grafana access token for security
        const grafanaToken = env.GRAFANA_TOKEN;
        const providedToken = request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
        console.log('[Grafana API] Token check:', {
          hasEnvToken: !!grafanaToken,
          envTokenLength: grafanaToken?.length || 0,
          hasProvidedToken: !!providedToken,
          providedTokenLength: providedToken?.length || 0,
          method: request.method,
          path: url.pathname
        });
        
        if (grafanaToken) {
          if (!providedToken || providedToken !== grafanaToken) {
            console.warn('[Grafana API] Unauthorized access attempt', { grafanaToken: !!grafanaToken, providedToken: !!providedToken });
            return jsonResponse({ error: 'unauthorized' }, 401, safeHeaders);
          }
          console.log('[Grafana API] Token validated successfully');
        } else {
          console.warn('[Grafana API] No GRAFANA_TOKEN env variable set - API is open to any request');
        }

        let items = [];
        if (store && store.forwardToDO) {
          const id = env.RECRUITS_DO.idFromName('global');
          const stub = env.RECRUITS_DO.get(id);
          const listReq = new Request(new URL('/api/recruits', request.url).toString(), {
            method: 'GET',
            headers: { 'content-type': 'application/json' }
          });
          const resp = await stub.fetch(listReq);
          const data = await resp.json();
          items = data.items || [];
        } else if (store) {
          items = await store.listAll();
        }

        console.log(`[Grafana API] Got ${items.length} items from DO`);

        const now = Date.now();
        const formatted = items.filter(r => {
          const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
          const status = String(r.status || 'recruiting');
          return (status === 'recruiting' && exp > now) || status !== 'recruiting';
        }).map(r => ({
          id: r.recruitId || r.id,
          title: r.title,
          game: r.game,
          platform: r.platform,
          ownerId: r.ownerId,
          participants_count: r.participants?.length || r.currentMembers?.length || 0,
          currentMembers: r.participants?.length || r.currentMembers?.length || 0,
          maxMembers: r.maxMembers || 0,
          voice: r.voice,
          status: r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          startTime: r.startTime
        }));

        console.log(`[Grafana API] Returning ${formatted.length} formatted items`);
        return jsonResponse(formatted, 200, safeHeaders);
      } catch (e) {
        console.error('[Grafana API] Error:', e);
        return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
      }
    }

    // Grafana: point-in-time snapshot ("/api/grafana/recruits/at")
    if (url.pathname === '/api/grafana/recruits/at' && (request.method === 'POST' || request.method === 'GET')) {
      try {
        const grafanaToken = env.GRAFANA_TOKEN;
        const providedToken = request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
        console.log('[Grafana API /at] Token check:', { hasEnvToken: !!grafanaToken, hasProvidedToken: !!providedToken });
        if (grafanaToken) {
          if (!providedToken || providedToken !== grafanaToken) {
            console.warn('[Grafana API /at] Unauthorized');
            return jsonResponse({ error: 'unauthorized' }, 401, safeHeaders);
          }
        } else {
          console.warn('[Grafana API /at] No GRAFANA_TOKEN set');
        }

        let items = [];
        if (store && store.forwardToDO) {
          const id = env.RECRUITS_DO.idFromName('global');
          const stub = env.RECRUITS_DO.get(id);
          const listReq = new Request(new URL('/api/recruits', request.url).toString(), { method: 'GET', headers: { 'content-type': 'application/json' } });
          const resp = await stub.fetch(listReq);
          const data = await resp.json();
          items = data.items || [];
        } else if (store) {
          items = await store.listAll();
        }

        // If Grafana provides time in body.range.to, use it; else now
        let body = {};
        try { body = await request.json(); } catch {}
        const toMs = body?.range?.to ? Date.parse(body.range.to) : Date.now();

        const snapshot = items.filter(r => {
          const expMs = r.expiresAt ? Date.parse(r.expiresAt) : Infinity;
          const createdMs = r.createdAt ? Date.parse(r.createdAt) : 0;
          return createdMs <= toMs && expMs > toMs;
        }).map(r => ({
          id: r.recruitId || r.id,
          title: r.title,
          game: r.game,
          platform: r.platform,
          ownerId: r.ownerId,
          participants_count: r.participants?.length || r.currentMembers?.length || 0,
          currentMembers: r.participants?.length || r.currentMembers?.length || 0,
          maxMembers: r.maxMembers || 0,
          voice: r.voice,
          status: r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          startTime: r.startTime
        }));

        console.log(`[Grafana API /at] Returning ${snapshot.length} items`);
        return jsonResponse(snapshot, 200, safeHeaders);
      } catch (e) {
        console.error('[Grafana API /at] Error:', e);
        return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
      }
    }

    // Grafana: history (recent open/closed recruits)
    if (url.pathname === '/api/grafana/recruits/history' && (request.method === 'POST' || request.method === 'GET')) {
      try {
        const grafanaToken = env.GRAFANA_TOKEN;
        const providedToken = request.headers.get('x-grafana-token') || request.headers.get('authorization')?.replace('Bearer ', '');
        console.log('[Grafana API /history] Token check:', { hasEnvToken: !!grafanaToken, hasProvidedToken: !!providedToken });
        if (grafanaToken) {
          if (!providedToken || providedToken !== grafanaToken) {
            console.warn('[Grafana API /history] Unauthorized');
            return jsonResponse({ error: 'unauthorized' }, 401, safeHeaders);
          }
        } else {
          console.warn('[Grafana API /history] No GRAFANA_TOKEN set');
        }

        let items = [];
        if (store && store.forwardToDO) {
          const id = env.RECRUITS_DO.idFromName('global');
          const stub = env.RECRUITS_DO.get(id);
          const listReq = new Request(new URL('/api/recruits', request.url).toString(), { method: 'GET', headers: { 'content-type': 'application/json' } });
          const resp = await stub.fetch(listReq);
          const data = await resp.json();
          items = data.items || [];
        } else if (store) {
          items = await store.listAll();
        }

        let body = {};
        try { body = await request.json(); } catch {}
        const range = body?.range || {};
        const toMs = range?.to ? Date.parse(range.to) : Date.now();
        const fromMs = range?.from ? Date.parse(range.from) : (toMs - 24*3600*1000);

        const withinRange = (ts) => {
          const t = ts ? Date.parse(ts) : NaN;
          return !Number.isNaN(t) && t >= fromMs && t <= toMs;
        };

        const history = items.filter(r => withinRange(r.createdAt) || withinRange(r.closedAt)).map(r => ({
          id: r.recruitId || r.id,
          title: r.title,
          game: r.game,
          platform: r.platform,
          ownerId: r.ownerId,
          participants_count: r.participants?.length || r.currentMembers?.length || 0,
          currentMembers: r.participants?.length || r.currentMembers?.length || 0,
          maxMembers: r.maxMembers || 0,
          voice: r.voice,
          status: r.status,
          createdAt: r.createdAt,
          closedAt: r.closedAt || null,
          expiresAt: r.expiresAt,
          startTime: r.startTime
        }));

        console.log(`[Grafana API /history] Returning ${history.length} items`);
        return jsonResponse(history, 200, safeHeaders);
      } catch (e) {
        console.error('[Grafana API /history] Error:', e);
        return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
      }
    }

    // Debug logging for recruitment endpoints
    if (url.pathname.includes('recruitment')) {
      console.log(`[DEBUG] ${request.method} ${url.pathname} (original: ${new URL(request.url).pathname})`);
      console.log(`[DEBUG] store available:`, !!store, `store.forwardToDO:`, !!store?.forwardToDO);
    }

    // Backwards compatibility: normalize /api/recruitment -> /api/recruitments
    // 正規化: 単数形を複数形に統一
    if (url.pathname === '/api/recruitment' || url.pathname === '/api/recruitment/') {
      console.log('[DEBUG] Normalizing singular to plural:', url.pathname, '-> /api/recruitments');
      url.pathname = '/api/recruitments';
    } else if (url.pathname.startsWith('/api/recruitment/')) {
      const pathParts = url.pathname.split('/').filter(Boolean); // ['api', 'recruitment', ...]
      if (pathParts.length >= 3) {
        // /api/recruitment/:id/... -> /api/recruitments/:id/...
        const oldPath = url.pathname;
        pathParts[1] = 'recruitments'; // 'recruitment' -> 'recruitments'
        url.pathname = '/' + pathParts.join('/');
        console.log('[DEBUG] Normalizing singular ID path:', oldPath, '->', url.pathname);
      }
    }

    console.log(`[DEBUG] After normalization: ${url.pathname}`);

    // GET /api/recruitments
    if (url.pathname === '/api/recruitments' && request.method === 'GET') {
      try {
        if (store.forwardToDO) {
          const res = await store.forwardToDO('/api/recruits', 'GET');
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const items = await store.listAll();
          return jsonResponse({ ok: true, items }, 200, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // GET /api/active-recruits (alias for /api/recruitments with active filter)
    if (url.pathname === '/api/active-recruits' && request.method === 'GET') {
      try {
        if (store.forwardToDO) {
          const res = await store.forwardToDO('/api/recruits', 'GET');
          const data = await res.json();
          const items = data.items || [];
          const now = Date.now();
          const active = items.filter(r => {
            const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
            return exp > now && r.status === 'recruiting';
          });
          return jsonResponse({ ok: true, body: active }, 200, safeHeaders);
        } else {
          const items = await store.listAll();
          const now = Date.now();
          const active = items.filter(r => {
            const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
            return exp > now && r.status === 'recruiting';
          });
          return jsonResponse({ ok: true, body: active }, 200, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // POST /api/recruitments (create) - requires Service Token
    if (url.pathname === '/api/recruitments' && request.method === 'POST') {
      console.log('[DEBUG] Matched POST /api/recruitments handler');
      if (!await verifyServiceToken(request, env)) {
        console.log('[DEBUG] Token verification failed');
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      console.log('[DEBUG] Token verified, proceeding with creation');
      try {
        const body = await request.json();
        if (store.forwardToDO) {
          const res = await store.forwardToDO('/api/recruits', 'POST', body, { authorization: request.headers.get('authorization') || ''});
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const item = await store.create(body);
          return jsonResponse({ ok: true, recruit: item }, 201, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // PATCH /api/recruitments/:id (update)
    if (url.pathname.match(/^\/api\/recruitments\/[^/]+$/) && request.method === 'PATCH') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      const id = url.pathname.split('/')[3];
      try {
        const update = await request.json();
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/api/recruits/${id}`, 'PATCH', update, { authorization: request.headers.get('authorization') || '' });
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          // No local update implementation; return not_found for now
          return jsonResponse({ ok: false, error: 'not_found' }, 404, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // GET /api/recruitments/:id
    if (url.pathname.startsWith('/api/recruitments/') && request.method === 'GET') {
      const id = url.pathname.split('/')[3];
      try {
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/api/recruits/${id}`, 'GET');
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const r = await store.get(id);
          if (!r) return jsonResponse({ ok: false, error: 'not_found' }, 404, safeHeaders);
          return jsonResponse({ ok: true, recruit: r }, 200, safeHeaders);
        }
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // POST /api/recruitments/:id/join
    if (url.pathname.match(/^\/api\/recruitments\/[^/]+\/join$/) && request.method === 'POST') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      const id = url.pathname.split('/')[3];
      try {
        const { userId } = await request.json();
        if (!userId) return jsonResponse({ ok: false, error: 'invalid_user' }, 400, safeHeaders);
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/api/recruits/${id}/join`, 'POST', { userId }, { authorization: request.headers.get('authorization') || '' });
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          const updated = await store.join(id, userId);
          return jsonResponse({ ok: true, recruit: updated }, 200, safeHeaders);
        }
      } catch (err) {
        if (err.message === 'full') return jsonResponse({ ok: false, error: 'full' }, 409, safeHeaders);
        return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // DELETE /api/recruitments/:id
    if (url.pathname.match(/^\/api\/recruitments\/[^/]+$/) && request.method === 'DELETE') {
      if (!await verifyServiceToken(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
      }
      const id = url.pathname.split('/')[3];
      let requesterId = '';
      try {
        const body = await request.json().catch(() => ({}));
        requesterId = body.userId || '';
      } catch (_e) {}
      try {
        if (store.forwardToDO) {
          const res = await store.forwardToDO(`/api/recruits/${id}`, 'DELETE', { userId: requesterId }, { authorization: request.headers.get('authorization') || ''});
          const text = await res.text();
          return new Response(text, { status: res.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }});
        } else {
          await store.delete(id, requesterId);
          return jsonResponse({ ok: true, status: 'deleted' }, 200, safeHeaders);
        }
      } catch (err) {
        if (err.message === 'forbidden') return jsonResponse({ ok: false, error: 'forbidden' }, 403, safeHeaders);
        return jsonResponse({ ok: false, error: err.message || 'server_error' }, 500, safeHeaders);
      }
    }

    // POST /api/cleanup (admin stub)
    if (url.pathname === '/api/cleanup' && request.method === 'POST') {
      // TODO: implement admin auth if needed
      return jsonResponse({ ok: true, cleaned: 0 }, 200, safeHeaders);
    }

    // One-time Bot Invite: Create (simplified - return static URL directly)
    if (url.pathname === '/api/bot-invite/one-time' && request.method === 'POST') {
      console.log('[index.js] Bot invite one-time POST received');
      try {
        const staticInviteUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
        return jsonResponse({ ok: true, url: staticInviteUrl }, 201, safeHeaders);
      } catch (e) {
        console.error('[index.js] Error:', e?.message || e);
        return jsonResponse({ error: 'internal_error', detail: e?.message }, 500, safeHeaders);
      }
    }

    /*
    // One-time Bot Invite: Landing page (GET)
    const matchInvite = url.pathname.match(/^\/api\/bot-invite\/t\/([A-Za-z0-9_\-]+)$/);
    if (matchInvite && request.method === 'GET') {
      ...
    }

    // One-time Bot Invite: Consume and redirect
    const matchInviteGo = url.pathname.match(/^\/api\/bot-invite\/t\/([A-Za-z0-9_\-]+)\/go$/);
    if (matchInviteGo && request.method === 'POST') {
      ...
    }
    */

    // Bot Invite: static redirect for other paths
    if (url.pathname.startsWith('/api/bot-invite')) {
      const redirectUrl = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';
      return new Response(null, { status: 302, headers: { Location: redirectUrl, ...safeHeaders } });
    }

    // fallback
    return new Response('Not Found', { status: 404, headers: safeHeaders });
  }
};
