import { jsonResponse } from '../worker/http.js';
import { verifyJWT } from '../worker/utils/auth.js';
import { verifyInternalAuth } from '../worker/auth.js';

function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || '').split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=');
    if (!k) return;
    cookies[k] = rest.join('=');
  });
  return cookies;
}

function isPremiumStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'active' || s === 'trialing';
}

function normalizeHex(color) {
  if (!color) return null;
  let c = String(color).trim();
  if (c.startsWith('#')) c = c.slice(1);
  if (!/^[0-9A-Fa-f]{6}$/.test(c)) return null;
  return c.toUpperCase();
}

function toIntOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function trimOrNull(value, maxLen = 2000) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v) return null;
  return v.slice(0, maxLen);
}

function sanitizeFileName(name) {
  return String(name || 'template')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64) || 'template';
}

function toSafeJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_e) {
    return null;
  }
}

function buildPublicAssetUrl(env, objectKey) {
  const base = String(env.R2_PUBLIC_BASE_URL || '').trim();
  if (!base) return null;
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${normalized}/${objectKey}`;
}

function resolveInternalBotBase(env) {
  return String(env.JWT_ISSUER_URL || env.VPS_EXPRESS_URL || env.TUNNEL_URL || '').trim();
}

async function inferLatestTemplateAssetKey(env, guildId, templateName) {
  if (!env?.PLUS_TEMPLATES_R2 || !guildId || !templateName) return null;

  const sanitizedName = sanitizeFileName(templateName);
  if (!sanitizedName) return null;

  const prefix = `plus-templates/${guildId}/`;
  const list = await env.PLUS_TEMPLATES_R2.list({ prefix, limit: 1000 }).catch(() => null);
  const objects = Array.isArray(list?.objects) ? list.objects : [];
  if (objects.length === 0) return null;

  const marker = `-${sanitizedName}.`;
  let latestKey = null;

  for (const obj of objects) {
    const key = String(obj?.key || '');
    if (!key.startsWith(prefix)) continue;
    if (!key.includes(marker)) continue;
    if (!latestKey || key > latestKey) latestKey = key;
  }

  return latestKey;
}

async function createSupabaseClient(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key);
}

async function getUserFromRequest(request, env) {
  try {
    const cookies = parseCookies(request.headers.get('Cookie'));
    const jwt = cookies.jwt ? decodeURIComponent(cookies.jwt) : null;
    if (!jwt) return null;
    const payload = await verifyJWT(jwt, env);
    if (!payload?.userId) return null;
    return {
      id: String(payload.userId),
      username: payload.username || null,
      role: payload.role || 'user',
    };
  } catch (_e) {
    return null;
  }
}

async function canAccessTemplates(user, guildId, env) {
  // Admin ユーザーは常にアクセス可能
  if (user?.role === 'admin') {
    return true;
  }
  // 通常ユーザーは Premium が必要
  return ensurePremiumForGuild(user.id, guildId, env);
}

async function ensurePremiumForGuild(userId, guildId, env) {
  const supabase = await createSupabaseClient(env);
  if (!supabase) return false;

  const withGuild = await supabase
    .from('subscriptions')
    .select('status, purchased_guild_id')
    .eq('user_id', userId)
    .eq('purchased_guild_id', guildId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!withGuild.error && withGuild.data && isPremiumStatus(withGuild.data.status)) {
    return true;
  }

  const fallback = await supabase
    .from('subscriptions')
    .select('status, purchased_guild_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallback.error || !fallback.data) return false;
  if (!isPremiumStatus(fallback.data.status)) return false;

  const purchasedGuild = String(fallback.data.purchased_guild_id || '').trim();
  return !purchasedGuild || purchasedGuild === guildId;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function readBodyField(body, camelKey, snakeKey) {
  if (hasOwn(body, camelKey)) return body[camelKey];
  if (hasOwn(body, snakeKey)) return body[snakeKey];
  return undefined;
}

function buildTemplatePayload(body, userId, env, existingTemplate = null) {
  const clearBackground = body?.clearBackground === true;

  const rawBackgroundAssetKey = readBodyField(body, 'backgroundAssetKey', 'background_asset_key');
  const rawBackgroundImageUrl = readBodyField(body, 'backgroundImageUrl', 'background_image_url');

  let backgroundAssetKey = rawBackgroundAssetKey === undefined
    ? undefined
    : trimOrNull(rawBackgroundAssetKey, 512);
  let backgroundImageUrl = rawBackgroundImageUrl === undefined
    ? undefined
    : trimOrNull(rawBackgroundImageUrl, 2000);

  if (!clearBackground) {
    if (!backgroundAssetKey) {
      backgroundAssetKey = existingTemplate?.background_asset_key || null;
    }
    if (!backgroundImageUrl) {
      backgroundImageUrl = existingTemplate?.background_image_url || null;
    }
  }

  if (!backgroundImageUrl && backgroundAssetKey) {
    backgroundImageUrl = buildPublicAssetUrl(env, backgroundAssetKey);
  }

  if (clearBackground) {
    backgroundAssetKey = null;
    backgroundImageUrl = null;
  }

  return {
    guild_id: trimOrNull(body.guildId, 64),
    name: trimOrNull(body.name, 100),
    title: trimOrNull(body.title, 150),
    participants: toIntOrNull(body.participants),
    color: normalizeHex(body.color),
    notification_role_id: trimOrNull(body.notificationRoleId, 64),
    content: trimOrNull(body.content, 4000),
    start_time_text: trimOrNull(body.startTimeText, 120),
    regulation_members: toIntOrNull(body.regulationMembers),
    voice_place: trimOrNull(body.voicePlace, 150),
    voice_option: trimOrNull(body.voiceOption, 150),
    background_image_url: backgroundImageUrl,
    background_asset_key: backgroundAssetKey,
    title_x: toIntOrNull(body.titleX),
    title_y: toIntOrNull(body.titleY),
    members_x: toIntOrNull(body.membersX),
    members_y: toIntOrNull(body.membersY),
    font_family: trimOrNull(body.fontFamily, 120),
    font_size: toIntOrNull(body.fontSize),
    text_color: normalizeHex(body.textColor),
    layout_json: toSafeJson(body.layout),
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
}

const TEMPLATE_SELECT = 'guild_id, name, title, participants, color, notification_role_id, content, start_time_text, regulation_members, voice_place, voice_option, background_image_url, background_asset_key, title_x, title_y, members_x, members_y, font_family, font_size, text_color, layout_json, updated_at';

async function listTemplates(request, env, safeHeaders) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, safeHeaders);

  const url = new URL(request.url);
  const guildId = String(url.searchParams.get('guildId') || '').trim();
  if (!guildId) return jsonResponse({ error: 'guildId is required' }, 400, safeHeaders);

  const hasAccess = await canAccessTemplates(user, guildId, env);
  if (!hasAccess) {
    return jsonResponse({ error: 'Premium subscription is required for this guild' }, 403, safeHeaders);
  }

  const supabase = await createSupabaseClient(env);
  if (!supabase) return jsonResponse({ error: 'Supabase is not configured' }, 500, safeHeaders);

  const { data, error } = await supabase
    .from('recruit_templates')
    .select(TEMPLATE_SELECT)
    .eq('guild_id', guildId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[plus/templates] list error:', error);
    return jsonResponse({ error: 'Failed to list templates' }, 500, safeHeaders);
  }

  return jsonResponse({ templates: data || [] }, 200, safeHeaders);
}

async function upsertTemplate(request, env, safeHeaders) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, safeHeaders);

  const body = await request.json().catch(() => ({}));
  const guildId = String(body.guildId || '').trim();
  const name = String(body.name || '').trim();
  if (!guildId || !name) {
    return jsonResponse({ error: 'guildId and name are required' }, 400, safeHeaders);
  }

  const hasAccess = await canAccessTemplates(user, guildId, env);
  if (!hasAccess) {
    return jsonResponse({ error: 'Premium subscription is required for this guild' }, 403, safeHeaders);
  }

  const supabase = await createSupabaseClient(env);
  if (!supabase) return jsonResponse({ error: 'Supabase is not configured' }, 500, safeHeaders);

  const { data: existingTemplate } = await supabase
    .from('recruit_templates')
    .select('background_asset_key, background_image_url')
    .eq('guild_id', guildId)
    .eq('name', name)
    .maybeSingle();

  const payload = buildTemplatePayload(body, user.id, env, existingTemplate || null);
  const { data, error } = await supabase
    .from('recruit_templates')
    .upsert(payload, { onConflict: 'guild_id,name' })
    .select(TEMPLATE_SELECT)
    .maybeSingle();

  if (error) {
    console.error('[plus/templates] upsert error:', error);
    return jsonResponse({ error: 'Failed to save template' }, 500, safeHeaders);
  }

  return jsonResponse({ ok: true, template: data }, 200, safeHeaders);
}

async function uploadTemplateAsset(request, env, safeHeaders) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, safeHeaders);

  if (!env.PLUS_TEMPLATES_R2) {
    return jsonResponse({ error: 'R2 bucket binding PLUS_TEMPLATES_R2 is not configured' }, 500, safeHeaders);
  }

  const form = await request.formData();
  const guildId = trimOrNull(form.get('guildId'), 64);
  const templateName = trimOrNull(form.get('templateName'), 100);
  const file = form.get('file');

  if (!guildId) return jsonResponse({ error: 'guildId is required' }, 400, safeHeaders);
  if (!templateName) return jsonResponse({ error: 'templateName is required' }, 400, safeHeaders);
  if (!file || typeof file.arrayBuffer !== 'function') {
    return jsonResponse({ error: 'file is required' }, 400, safeHeaders);
  }

  const hasPremium = await ensurePremiumForGuild(user.id, guildId, env);
  if (!hasPremium) {
    return jsonResponse({ error: 'Premium subscription is required for this guild' }, 403, safeHeaders);
  }

  const mimeType = String(file.type || '').toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return jsonResponse({ error: 'Only image files are allowed' }, 400, safeHeaders);
  }

  const originalName = String(file.name || 'template.png');
  const ext = (originalName.split('.').pop() || 'png').toLowerCase();
  const key = `plus-templates/${guildId}/${Date.now()}-${sanitizeFileName(templateName)}.${ext}`;
  const bytes = await file.arrayBuffer();

  await env.PLUS_TEMPLATES_R2.put(key, bytes, {
    httpMetadata: { contentType: mimeType || 'application/octet-stream' },
    customMetadata: {
      uploadedBy: user.id,
      guildId,
      templateName: sanitizeFileName(templateName),
    },
  });

  // Upload-only flowでも画像設定が残るように、同名テンプレートへ背景情報を保存する
  const supabase = await createSupabaseClient(env);
  if (supabase) {
    const now = new Date().toISOString();
    const backgroundImageUrl = buildPublicAssetUrl(env, key);
    const { data: existingTemplate } = await supabase
      .from('recruit_templates')
      .select('guild_id, name')
      .eq('guild_id', guildId)
      .eq('name', templateName)
      .maybeSingle();

    if (existingTemplate) {
      await supabase
        .from('recruit_templates')
        .update({
          background_asset_key: key,
          background_image_url: backgroundImageUrl,
          updated_at: now,
        })
        .eq('guild_id', guildId)
        .eq('name', templateName);
    } else {
      await supabase
        .from('recruit_templates')
        .upsert({
          guild_id: guildId,
          name: templateName,
          title: '募集タイトル',
          participants: 4,
          color: '5865F2',
          content: 'ガチエリア / 初心者歓迎',
          start_time_text: '今から',
          voice_place: '通話あり',
          created_by: user.id,
          updated_at: now,
          background_asset_key: key,
          background_image_url: backgroundImageUrl,
        }, { onConflict: 'guild_id,name' });
    }
  }

  return jsonResponse({
    ok: true,
    objectKey: key,
    publicUrl: buildPublicAssetUrl(env, key),
  }, 200, safeHeaders);
}

async function getTemplateForBot(request, url, env, safeHeaders) {
  if (!await verifyInternalAuth(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401, safeHeaders);
  }

  const guildId = String(url.searchParams.get('guildId') || '').trim();
  const name = String(url.searchParams.get('name') || '').trim();
  if (!guildId || !name) {
    return jsonResponse({ error: 'guildId and name are required' }, 400, safeHeaders);
  }

  const supabase = await createSupabaseClient(env);
  if (!supabase) return jsonResponse({ error: 'Supabase is not configured' }, 500, safeHeaders);

  const { data, error } = await supabase
    .from('recruit_templates')
    .select(TEMPLATE_SELECT)
    .eq('guild_id', guildId)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    console.error('[plus/templates] bot get error:', error);
    return jsonResponse({ error: 'Failed to load template' }, 500, safeHeaders);
  }

  let template = data || null;
  if (template && !template.background_asset_key && !template.background_image_url) {
    const inferredKey = await inferLatestTemplateAssetKey(env, guildId, name);
    if (inferredKey) {
      template = {
        ...template,
        background_asset_key: inferredKey,
        background_image_url: buildPublicAssetUrl(env, inferredKey),
      };
    }
  }

  return jsonResponse({ template }, 200, safeHeaders);
}

async function listTemplatesForBot(request, url, env, safeHeaders) {
  if (!await verifyInternalAuth(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401, safeHeaders);
  }

  const guildId = String(url.searchParams.get('guildId') || '').trim();
  const search = String(url.searchParams.get('search') || '').trim();
  if (!guildId) {
    return jsonResponse({ error: 'guildId is required' }, 400, safeHeaders);
  }

  const supabase = await createSupabaseClient(env);
  if (!supabase) return jsonResponse({ error: 'Supabase is not configured' }, 500, safeHeaders);

  let query = supabase
    .from('recruit_templates')
    .select(TEMPLATE_SELECT)
    .eq('guild_id', guildId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[plus/templates] bot list error:', error);
    return jsonResponse({ error: 'Failed to list templates' }, 500, safeHeaders);
  }

  return jsonResponse({ templates: data || [] }, 200, safeHeaders);
}

async function previewTemplate(request, env, safeHeaders) {
  const user = await getUserFromRequest(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, safeHeaders);

  const body = await request.json().catch(() => ({}));
  const guildId = String(body.guildId || '').trim();
  if (!guildId) {
    return jsonResponse({ error: 'guildId is required' }, 400, safeHeaders);
  }

  const hasAccess = await canAccessTemplates(user, guildId, env);
  if (!hasAccess) {
    return jsonResponse({ error: 'Premium subscription is required for this guild' }, 403, safeHeaders);
  }

  const internalBase = resolveInternalBotBase(env);
  if (!internalBase || !env.INTERNAL_SECRET) {
    return jsonResponse({ error: 'Internal preview service is not configured' }, 503, safeHeaders);
  }

  const upstreamUrl = new URL('/internal/recruit-preview', internalBase);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': env.INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err?.name === 'AbortError' ? 'Preview generation timeout (>30s)' : String(err?.message || err);
    return jsonResponse({ error: 'Preview generation failed', detail: msg }, 502, safeHeaders);
  }
  
  clearTimeout(timeoutId);

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => 'no response');
    return jsonResponse({ error: 'Preview generation failed', detail }, 502, safeHeaders);
  }

  const headers = new Headers(safeHeaders);
  headers.set('Content-Type', 'image/png');
  headers.set('Cache-Control', 'no-store');
  return new Response(upstream.body, { status: 200, headers });
}

async function serveTemplateAsset(request, url, env) {
  if (!env.PLUS_TEMPLATES_R2) {
    return new Response('R2 not configured', { status: 503 });
  }

  // /api/plus/assets/plus-templates/{guildId}/{filename}
  const key = url.pathname.replace(/^\/api\/plus\/assets\//, '');
  if (!key || key.includes('..')) {
    return new Response('Bad Request', { status: 400 });
  }

  const obj = await env.PLUS_TEMPLATES_R2.get(key);
  if (!obj) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(obj.body, { status: 200, headers });
}

export async function handlePlusTemplateRoutes(request, env, { url, safeHeaders }) {
  if (url.pathname === '/api/plus/templates' && request.method === 'GET') {
    return listTemplates(request, env, safeHeaders);
  }

  if (url.pathname === '/api/plus/templates' && request.method === 'POST') {
    return upsertTemplate(request, env, safeHeaders);
  }

  if (url.pathname === '/api/plus/template-assets/upload' && request.method === 'POST') {
    return uploadTemplateAsset(request, env, safeHeaders);
  }

  if (url.pathname === '/api/plus/bot/template' && request.method === 'GET') {
    return getTemplateForBot(request, url, env, safeHeaders);
  }

  if (url.pathname === '/api/plus/bot/templates' && request.method === 'GET') {
    return listTemplatesForBot(request, url, env, safeHeaders);
  }

  if (url.pathname === '/api/plus/templates/preview' && request.method === 'POST') {
    return previewTemplate(request, env, safeHeaders);
  }

  if (url.pathname.startsWith('/api/plus/assets/') && request.method === 'GET') {
    return serveTemplateAsset(request, url, env);
  }

  return null;
}
