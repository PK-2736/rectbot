import { resolveSupabaseRestUrl, buildSupabaseHeaders, pingSupabase } from '../supabase.js';

// Helper: Check if HTTP status code should trigger a retry
function isRetryableStatus(response, retryOn) {
  return retryOn.has(response.status);
}

// Helper: Check if we should retry based on current attempt
function shouldRetryAttempt(attempt, maxRetries) {
  return attempt < maxRetries;
}

// Helper: Calculate exponential backoff delay
function calculateBackoff(backoffMs, attempt) {
  return backoffMs * Math.pow(2, attempt);
}

// Helper: Sleep for specified milliseconds
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Helper: Handle retryable HTTP response with delay
async function handleRetryableResponse(attempt, retries, backoffMs) {
  if (!shouldRetryAttempt(attempt, retries)) {
    return false; // No more retries
  }
  const delayMs = calculateBackoff(backoffMs, attempt);
  await delay(delayMs);
  return true; // Continue retrying
}

// Helper: Handle network error with retry logic
async function handleNetworkError(error, attempt, retries, backoffMs) {
  // If no more retries, rethrow immediately
  if (!shouldRetryAttempt(attempt, retries)) {
    throw error;
  }
  // Otherwise, delay and signal to continue
  const delayMs = calculateBackoff(backoffMs, attempt);
  await delay(delayMs);
}

// Lightweight fetch with retry for transient errors from Supabase/edge
async function fetchWithRetry(url, options, { retries = 2, backoffMs = 300, retryOn = new Set([429, 500, 502, 503, 504, 520, 522, 523, 524, 530]) } = {}) {
  let lastErr;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      
      // Guard: If response status is not retryable, return immediately
      if (!isRetryableStatus(res, retryOn)) {
        return res;
      }
      
      // Guard: If this is the last attempt, return the response even if retryable
      if (!shouldRetryAttempt(attempt, retries)) {
        return res;
      }
      
      // Retry with backoff
      await handleRetryableResponse(attempt, retries, backoffMs);
      
    } catch (e) {
      lastErr = e;
      
      // Guard: Handle network error (will throw if last attempt)
      await handleNetworkError(e, attempt, retries, backoffMs);
    }
  }
  
  // Fallback: should not reach here
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
      recruit_channel_ids: Array.isArray(incomingSettings.recruit_channels)
        ? incomingSettings.recruit_channels.filter(Boolean).map(String)
        : (Object.prototype.hasOwnProperty.call(incomingSettings, 'recruit_channels') ? [] : undefined),
      notification_role_id: serializedNotificationRoleId,
      default_title: incomingSettings.defaultTitle || '参加者募集',
  // default_color: include only if the caller sent the property (supports clearing with null)
  default_color: Object.prototype.hasOwnProperty.call(incomingSettings, 'defaultColor') ? (incomingSettings.defaultColor || null) : undefined,
      update_channel_id: incomingSettings.update_channel || null,
      enable_dedicated_channel: Object.prototype.hasOwnProperty.call(incomingSettings, 'enable_dedicated_channel') ? !!incomingSettings.enable_dedicated_channel : undefined,
      dedicated_channel_category_id: Object.prototype.hasOwnProperty.call(incomingSettings, 'dedicated_channel_category_id') ? (incomingSettings.dedicated_channel_category_id || null) : undefined,
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
          message: '設定を受け付けましたが、保存されませんでした（Supabaseが設定されていません）',
          warning: 'バックエンドでSupabaseが設定されていません。データは保存されませんでした。',
          details: detailMessage,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseHeaders = buildSupabaseHeaders(env);

    try {
      const pingOk = await pingSupabase(env, 4000);
      console.log('[finalize] Supabase ping result:', pingOk);
      if (!pingOk) {
        console.warn('[finalize] Supabase ping failed, treating as unreachable');
        return new Response(JSON.stringify({
          ok: true,
          message: '設定を受け付けましたが、保存されませんでした（Supabaseに接続できません）',
          warning: 'Supabaseに接続できませんでした。',
          details: 'ping failed'
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      console.warn('[finalize] Supabase ping error:', e?.message || e);
      return new Response(JSON.stringify({
        ok: true,
        message: '設定を受け付けましたが、保存されませんでした（Supabaseに接続できません）',
        warning: 'Supabase pingでエラーが発生しました。',
        details: e?.message || e
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check existing
    const existingRes = await fetchWithRetry(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
      method: 'GET',
      headers: supabaseHeaders,
    });
    if (!existingRes.ok) {
      const errorText = await existingRes.text();
      console.error('[finalize] Check existing failed:', existingRes.status, errorText);
      // Treat Supabase non-OK as transient/unreachable. Return success with warning
      return new Response(JSON.stringify({
        ok: true,
        message: '設定を受け付けましたが、保存されませんでした（Supabaseに接続できません）',
        warning: `Supabaseチェックに失敗しました: ${existingRes.status}`,
        details: errorText
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const existingData = await existingRes.json();

    let supaRes;
    if (Array.isArray(existingData) && existingData.length > 0) {
        const patchBody = { updated_at: new Date().toISOString() };
        if (supabaseData.recruit_channel_id !== null) patchBody.recruit_channel_id = supabaseData.recruit_channel_id;
        if (Array.isArray(supabaseData.recruit_channel_ids)) patchBody.recruit_channel_ids = supabaseData.recruit_channel_ids;
        patchBody.notification_role_id = supabaseData.notification_role_id;
        if (supabaseData.default_title) patchBody.default_title = supabaseData.default_title;
      // default_color may be null to represent that the user wants to clear the value.
      // Use property existence check to allow clearing the value explicitly.
      if (Object.prototype.hasOwnProperty.call(incomingSettings, 'defaultColor')) patchBody.default_color = supabaseData.default_color;
        if (supabaseData.update_channel_id !== null) patchBody.update_channel_id = supabaseData.update_channel_id;
        if (typeof supabaseData.enable_dedicated_channel === 'boolean') patchBody.enable_dedicated_channel = supabaseData.enable_dedicated_channel;
        if (Object.prototype.hasOwnProperty.call(incomingSettings, 'dedicated_channel_category_id')) patchBody.dedicated_channel_category_id = supabaseData.dedicated_channel_category_id;

      const cleanedPatchBody = Object.fromEntries(Object.entries(patchBody).filter(([, v]) => v !== undefined));
      supaRes = await fetchWithRetry(`${supabaseRestUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify(cleanedPatchBody),
      });
    } else {
      const supabaseBody = Object.fromEntries(Object.entries(supabaseData).filter(([, v]) => v !== undefined));
      supaRes = await fetchWithRetry(`${supabaseRestUrl}/rest/v1/guild_settings`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify(supabaseBody),
      });
    }

    if (!supaRes.ok) {
      const errorText = await supaRes.text();
      console.error('[finalize] Supabase operation failed:', supaRes.status, errorText);
      // Avoid failing the entire finalize flow if Supabase cannot persist right now.
      return new Response(JSON.stringify({
        ok: true,
        message: '設定を受け付けましたが、保存されませんでした（Supabase保存失敗）',
        warning: `Supabase保存に失敗しました: ${supaRes.status}`,
        details: errorText
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, message: '設定が正常に保存されました' }), {
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
    recruit_channels: [],
    notification_role: null,
    notification_roles: [],
    defaultTitle: '参加者募集',
  defaultColor: null,
    update_channel: null,
    enable_dedicated_channel: false,
    dedicated_channel_category_id: null,
  };
  try {
    const guildId = url.pathname.split('/api/guild-settings/')[1];
    console.log('[guild-settings:get] Fetching settings for guild:', guildId);
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
    console.log('[guild-settings:get] Supabase data for guild', guildId, ':', data);
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

    const recruitChannels = Array.isArray(data[0].recruit_channel_ids)
      ? data[0].recruit_channel_ids.filter(Boolean).map(String)
      : [];

    const settings = {
      recruit_channel: data[0].recruit_channel_id || (recruitChannels[0] || null),
      recruit_channels: recruitChannels,
      notification_role: notificationRoles.length > 0 ? notificationRoles[0] : null,
      notification_roles: notificationRoles,
      defaultTitle: data[0].default_title || '参加者募集',
  defaultColor: data[0].default_color || null,
      update_channel: data[0].update_channel_id,
      enable_dedicated_channel: typeof data[0].enable_dedicated_channel === 'boolean' ? data[0].enable_dedicated_channel : false,
      dedicated_channel_category_id: data[0].dedicated_channel_category_id || null,
    };
    console.log('[guild-settings:get] Returning settings for guild', guildId, ':', settings);
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
