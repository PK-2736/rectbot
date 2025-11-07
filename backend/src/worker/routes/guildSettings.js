import { resolveSupabaseRestUrl, buildSupabaseHeaders, pingSupabase } from '../supabase.js';

// Lightweight fetch with retry for transient errors from Supabase/edge
async function fetchWithRetry(url, options, { retries = 2, backoffMs = 300, retryOn = new Set([429, 500, 502, 503, 504, 520, 522, 523, 524, 530]) } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (retryOn.has(res.status)) {
        if (attempt < retries) {
          const delay = backoffMs * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const delay = backoffMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  // Should not reach here; throw last error just in case
  throw lastErr || new Error('fetchWithRetry: unknown error');
}

// POST /api/guild-settings/finalize
async function handleFinalize(request, env, corsHeaders) {
  try {
    const payload = await request.json();
    const guildId = payload && payload.guildId;
    const incomingSettings = { ...payload };
    delete incomingSettings.guildId;

    if (!guildId) {
      return new Response(JSON.stringify({ error: 'Guild ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedNotificationRoles = (() => {
      const roles = [];
      if (Array.isArray(incomingSettings.notification_roles)) {
        roles.push(...incomingSettings.notification_roles.filter(Boolean).map(String));
      }
      if (incomingSettings.notification_role) {
        roles.push(String(incomingSettings.notification_role));
      }
      return [...new Set(roles)].slice(0, 25);
    })();

    const serializedNotificationRoleId = (() => {
      if (normalizedNotificationRoles.length === 0) return null;
      if (normalizedNotificationRoles.length === 1) return normalizedNotificationRoles[0];
      try {
        return JSON.stringify(normalizedNotificationRoles);
      } catch (e) {
        console.warn('[finalize] Failed to serialize notification roles:', e?.message || e);
        return normalizedNotificationRoles[0];
      }
    })();

    const supabaseData = {
      guild_id: guildId,
      recruit_channel_id: incomingSettings.recruit_channel || null,
      notification_role_id: serializedNotificationRoleId,
      default_title: incomingSettings.defaultTitle || '参加者募集',
      default_color: incomingSettings.defaultColor || '#00FFFF',
      update_channel_id: incomingSettings.update_channel || null,
      updated_at: new Date().toISOString(),
    };

    const supabaseRestUrl = resolveSupabaseRestUrl(env);
    const missing = [];
    if (!supabaseRestUrl) missing.push('SUPABASE_URL');
    if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missing.length > 0) {
      const detailMessage = `Missing Supabase configuration: ${missing.join(', ')}`;
      console.warn('[finalize] Supabase not configured, skipping persistence.', detailMessage);
      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Settings accepted but not persisted (Supabase not configured)',
          warning: 'Supabase is not configured on the backend. No data was saved.',
          details: detailMessage,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseHeaders = buildSupabaseHeaders(env);

    try {
      const pingOk = await pingSupabase(env, 4000);
      console.log('[finalize] Supabase ping result:', pingOk);
    } catch (e) {
      console.warn('[finalize] Supabase ping error:', e?.message || e);
    }

    // Check existing
    const existingRes = await fetchWithRetry(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
      method: 'GET',
      headers: supabaseHeaders,
    });
    if (!existingRes.ok) {
      const errorText = await existingRes.text();
      console.error('[finalize] Check existing failed:', existingRes.status, errorText);
      throw new Error(`Failed to check existing settings: ${existingRes.status} - ${errorText}`);
    }
    const existingData = await existingRes.json();

    let supaRes;
    if (Array.isArray(existingData) && existingData.length > 0) {
      const patchBody = { updated_at: new Date().toISOString() };
      if (supabaseData.recruit_channel_id !== null) patchBody.recruit_channel_id = supabaseData.recruit_channel_id;
      patchBody.notification_role_id = supabaseData.notification_role_id;
      if (supabaseData.default_title) patchBody.default_title = supabaseData.default_title;
      if (supabaseData.default_color) patchBody.default_color = supabaseData.default_color;
      if (supabaseData.update_channel_id !== null) patchBody.update_channel_id = supabaseData.update_channel_id;

      supaRes = await fetchWithRetry(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify(patchBody),
      });
    } else {
      supaRes = await fetchWithRetry(`${supabaseRestUrl}/rest/v1/guild_settings`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify(supabaseData),
      });
    }

    if (!supaRes.ok) {
      const errorText = await supaRes.text();
      console.error('[finalize] Supabase operation failed:', supaRes.status, errorText);
      throw new Error(`Supabase save failed: ${supaRes.status} - ${errorText}`);
    }

    return new Response(JSON.stringify({ ok: true, message: 'Settings saved successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[finalize] Guild settings finalize error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message, timestamp: new Date().toISOString() }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// GET /api/guild-settings/:guildId
async function handleGet(request, env, corsHeaders, url, ctx) {
  const defaultSettings = {
    recruit_channel: null,
    notification_role: null,
    notification_roles: [],
    defaultTitle: '参加者募集',
    defaultColor: '#00FFFF',
    update_channel: null,
  };
  try {
    const guildId = url.pathname.split('/api/guild-settings/')[1];
    if (!guildId) {
      return new Response(JSON.stringify({ error: 'Guild ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseRestUrl = resolveSupabaseRestUrl(env);
    if (!supabaseRestUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[guild-settings:get] Supabase not configured, returning defaults');
      return new Response(JSON.stringify(defaultSettings), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseHeaders = buildSupabaseHeaders(env);
    const supaRes = await fetch(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
      method: 'GET',
      headers: supabaseHeaders,
    });
    if (!supaRes.ok) throw new Error(`Supabase fetch failed: ${supaRes.status}`);
    const data = await supaRes.json();
    if (!Array.isArray(data) || data.length === 0) {
      return new Response(JSON.stringify(defaultSettings), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawNotificationRole = data[0].notification_role_id;
    let notificationRoles = [];
    if (Array.isArray(rawNotificationRole)) notificationRoles = rawNotificationRole.map(String);
    else if (typeof rawNotificationRole === 'string') {
      const trimmed = rawNotificationRole.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) notificationRoles = parsed.filter(Boolean).map(String);
        } catch (e) { console.warn('[guild-settings:get] parse notification_role_id JSON failed:', e?.message || e); }
      }
      if (notificationRoles.length === 0 && trimmed.length > 0) notificationRoles = [trimmed];
    } else if (rawNotificationRole) notificationRoles = [String(rawNotificationRole)];

    notificationRoles = [...new Set(notificationRoles)].slice(0, 25);

    const settings = {
      recruit_channel: data[0].recruit_channel_id,
      notification_role: notificationRoles.length > 0 ? notificationRoles[0] : null,
      notification_roles: notificationRoles,
      defaultTitle: data[0].default_title || '参加者募集',
      defaultColor: data[0].default_color || '#00FFFF',
      update_channel: data[0].update_channel_id,
    };
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Guild settings fetch error:', error);
    // best-effort: return defaults
    return new Response(JSON.stringify(defaultSettings), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Router entry for guild-settings
export async function routeGuildSettings(request, env, ctx, url, corsHeaders) {
  if (url.pathname === '/api/guild-settings/finalize' && request.method === 'POST') {
    return await handleFinalize(request, env, corsHeaders);
  }
  if (url.pathname.startsWith('/api/guild-settings/') && request.method === 'GET') {
    return await handleGet(request, env, corsHeaders, url, ctx);
  }
  return null;
}
