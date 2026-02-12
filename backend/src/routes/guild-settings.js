import { jsonResponse } from '../worker/http.js';
import { verifyServiceToken } from '../worker/auth.js';
import { resolveSupabaseRestUrl, buildSupabaseHeaders } from '../worker/supabase.js';

function normalizeNotificationRoles(notificationRoles, notificationRole) {
  const roles = [];
  if (Array.isArray(notificationRoles)) {
    roles.push(...notificationRoles.filter(Boolean).map(String));
  }
  if (notificationRole) {
    roles.push(String(notificationRole));
  }
  return [...new Set(roles)].slice(0, 25);
}

function serializeNotificationRoleId(normalizedRoles) {
  if (normalizedRoles.length === 0) return null;
  if (normalizedRoles.length === 1) return normalizedRoles[0];
  try {
    return JSON.stringify(normalizedRoles);
  } catch (_err) {
    return normalizedRoles[0];
  }
}

function parseNotificationRoles(rawNotificationRole) {
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
  } else if (rawNotificationRole) {
    notificationRoles = [String(rawNotificationRole)];
  }

  return [...new Set(notificationRoles)].slice(0, 25);
}

function validateGuildSettingsRequest(body, safeHeaders) {
  if (!body.guildId) {
    return {
      valid: false,
      response: jsonResponse({ ok: false, error: 'guildId is required' }, 400, safeHeaders)
    };
  }
  return { valid: true };
}

function validateSupabaseConfig(env, safeHeaders) {
  const supabaseUrl = resolveSupabaseRestUrl(env);
  
  if (!supabaseUrl) {
    console.error('[Guild Settings Finalize] Supabase URL is not configured');
    return {
      valid: false,
      response: jsonResponse({ ok: false, error: 'Supabase URL is not configured' }, 500, safeHeaders)
    };
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Guild Settings Finalize] Supabase service role key is not configured');
    return {
      valid: false,
      response: jsonResponse({ ok: false, error: 'Supabase service role key is not configured' }, 500, safeHeaders)
    };
  }

  return { valid: true, supabaseUrl };
}

function buildGuildSettingsPayload(body, normalizedNotificationRoles, serializedNotificationRoleId) {
  const {
    guildId,
    recruit_channel,
    recruit_channels,
    update_channel,
    defaultColor,
    defaultTitle,
    recruit_style,
    enable_dedicated_channel,
    dedicated_channel_category_id
  } = body;

  return {
    guild_id: guildId,
    recruit_channel_id: recruit_channel || null,
    recruit_channel_ids: Array.isArray(recruit_channels) 
      ? recruit_channels.filter(Boolean).map(String) 
      : (Object.prototype.hasOwnProperty.call(body, 'recruit_channels') ? [] : undefined),
    notification_role_id: serializedNotificationRoleId,
    update_channel_id: update_channel || null,
    default_color: Object.prototype.hasOwnProperty.call(body, 'defaultColor') ? (defaultColor || null) : undefined,
    default_title: defaultTitle || '参加者募集',
    recruit_style: Object.prototype.hasOwnProperty.call(body, 'recruit_style') ? (recruit_style || null) : undefined,
    enable_dedicated_channel: Object.prototype.hasOwnProperty.call(body, 'enable_dedicated_channel') ? !!enable_dedicated_channel : undefined,
    dedicated_channel_category_id: Object.prototype.hasOwnProperty.call(body, 'dedicated_channel_category_id') ? (dedicated_channel_category_id || null) : undefined,
    updated_at: new Date().toISOString()
  };
}

async function saveGuildSettingsToSupabase(env, supabaseUrl, payload, safeHeaders) {
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
}

async function handleGuildSettingsFinalize(request, env, { safeHeaders }) {
  if (!await verifyServiceToken(request, env)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
  }

  try {
    const body = await request.json();
    
    const requestValidation = validateGuildSettingsRequest(body, safeHeaders);
    if (!requestValidation.valid) {
      return requestValidation.response;
    }

    const configValidation = validateSupabaseConfig(env, safeHeaders);
    if (!configValidation.valid) {
      return configValidation.response;
    }
    const { supabaseUrl } = configValidation;

    const normalizedNotificationRoles = normalizeNotificationRoles(
      body.notification_roles,
      body.notification_role
    );
    const serializedNotificationRoleId = serializeNotificationRoleId(normalizedNotificationRoles);
    const payload = buildGuildSettingsPayload(body, normalizedNotificationRoles, serializedNotificationRoleId);

    console.log('[Guild Settings Finalize] Saving to Supabase:', {
      supabaseUrl,
      guildId: body.guildId,
      keys: Object.keys(payload),
      notificationRoles: normalizedNotificationRoles,
      serializedNotificationRoleId
    });

    return await saveGuildSettingsToSupabase(env, supabaseUrl, payload, safeHeaders);
  } catch (error) {
    console.error('[Guild Settings Finalize] Error:', error);
    return jsonResponse({ ok: false, error: error.message }, 500, safeHeaders);
  }
}

function parseRecruitChannels(settings) {
  const recruitChannels = Array.isArray(settings.recruit_channel_ids)
    ? settings.recruit_channel_ids.filter(Boolean).map(String)
    : [];
  const primaryRecruitChannel = settings.recruit_channel_id || (recruitChannels.length > 0 ? recruitChannels[0] : null);
  
  return { recruitChannels, primaryRecruitChannel };
}

function buildGuildSettingsResponse(settings) {
  const notificationRoles = parseNotificationRoles(settings.notification_role_id);
  const { recruitChannels, primaryRecruitChannel } = parseRecruitChannels(settings);

  return {
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
  };
}

async function fetchGuildSettingsFromSupabase(guildId, env, safeHeaders) {
  const supabaseUrl = resolveSupabaseRestUrl(env);
  if (!supabaseUrl) {
    return { error: jsonResponse({ ok: false, error: 'Supabase URL is not configured' }, 500, safeHeaders) };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/guild_settings?guild_id=eq.${guildId}&select=*`, {
    method: 'GET',
    headers: buildSupabaseHeaders(env)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Guild Settings Get] Supabase error:', errorText);
    return { error: jsonResponse({ ok: false, error: 'Failed to get from Supabase' }, 500, safeHeaders) };
  }

  const data = await response.json();
  return { data };
}

async function handleGuildSettingsGet(request, env, { url, safeHeaders }) {
  const guildId = url.pathname.split('/').pop();

  try {
    const { data, error } = await fetchGuildSettingsFromSupabase(guildId, env, safeHeaders);
    if (error) return error;

    if (data.length === 0) {
      return jsonResponse({}, 200, safeHeaders);
    }

    const settings = data[0];
    const responseData = buildGuildSettingsResponse(settings);

    return jsonResponse(responseData, 200, safeHeaders);
  } catch (error) {
    console.error('[Guild Settings Get] Error:', error);
    return jsonResponse({ ok: false, error: error.message }, 500, safeHeaders);
  }
}

async function handleGuildSettingsRoutes(request, env, { url, safeHeaders }) {
  if (url.pathname === '/api/guild-settings/finalize' && request.method === 'POST') {
    return await handleGuildSettingsFinalize(request, env, { safeHeaders });
  }

  if (url.pathname.match(/^\/api\/guild-settings\/[^/]+$/) && request.method === 'GET') {
    return await handleGuildSettingsGet(request, env, { url, safeHeaders });
  }

  return null;
}

export { handleGuildSettingsRoutes };
