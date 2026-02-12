const config = require('../../config');
const backendFetch = require('../backendFetch');
const { ensureRedisConnection } = require('./redis');

function normalizeRecruitStyle(normalized) {
  if (Object.prototype.hasOwnProperty.call(normalized, 'recruit_style')) {
    const v = normalized.recruit_style;
    normalized.recruit_style = v === 'simple' ? 'simple' : 'image';
  } else {
    normalized.recruit_style = 'image';
  }
}

function normalizeRolesArray(rawArray) {
  const filtered = Array.isArray(rawArray) ? rawArray.filter(Boolean).map(String) : [];
  return [...new Set(filtered)].slice(0, 25);
}

function syncNotificationRoleFromArray(normalized, uniqueRoles, hasRoleString) {
  if (!hasRoleString || normalized.notification_role === undefined) {
    normalized.notification_role = uniqueRoles.length > 0 ? uniqueRoles[0] : null;
  } else if (normalized.notification_role !== null) {
    normalized.notification_role = String(normalized.notification_role);
  }
}

function syncNotificationRolesFromRole(normalized, uniqueRoles) {
  if (normalized.notification_role !== null && uniqueRoles.length === 0 && normalized.notification_role) {
    normalized.notification_roles = [normalized.notification_role];
  }
}

function handleRoleStringOnly(normalized) {
  const roleId = normalized.notification_role ? String(normalized.notification_role) : null;
  normalized.notification_role = roleId;
  normalized.notification_roles = roleId ? [roleId] : [];
}

function normalizeNotificationRoles(normalized) {
  const hasRolesArray = Object.prototype.hasOwnProperty.call(normalized, 'notification_roles');
  const hasRoleString = Object.prototype.hasOwnProperty.call(normalized, 'notification_role');

  if (hasRolesArray) {
    const uniqueRoles = normalizeRolesArray(normalized.notification_roles);
    normalized.notification_roles = uniqueRoles;
    
    syncNotificationRoleFromArray(normalized, uniqueRoles, hasRoleString);
    syncNotificationRolesFromRole(normalized, uniqueRoles);
    
    if (uniqueRoles.length === 0) {
      normalized.notification_role = null;
    }
  } else if (hasRoleString) {
    handleRoleStringOnly(normalized);
  }
}

function normalizeRecruitChannels(normalized) {
  if (Object.prototype.hasOwnProperty.call(normalized, 'recruit_channel')) {
    normalized.recruit_channel = normalized.recruit_channel ? String(normalized.recruit_channel) : null;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'recruit_channels')) {
    const arr = Array.isArray(normalized.recruit_channels) ? normalized.recruit_channels : [];
    const uniqueChannels = [...new Set(arr.filter(Boolean).map(String))].slice(0, 25);
    normalized.recruit_channels = uniqueChannels;
    if (!normalized.recruit_channel && uniqueChannels.length > 0) {
      normalized.recruit_channel = uniqueChannels[0];
    }
  }
}

function normalizeDedicatedChannelSettings(normalized) {
  if (Object.prototype.hasOwnProperty.call(normalized, 'enable_dedicated_channel')) {
    normalized.enable_dedicated_channel = !!normalized.enable_dedicated_channel;
  } else {
    normalized.enable_dedicated_channel = false;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'dedicated_channel_category_id')) {
    normalized.dedicated_channel_category_id = normalized.dedicated_channel_category_id ? String(normalized.dedicated_channel_category_id) : null;
  }
}

function normalizeGuildSettingsObject(input) {
  const normalized = { ...(input || {}) };
  normalizeRecruitStyle(normalized);
  normalizeNotificationRoles(normalized);
  normalizeRecruitChannels(normalized);
  normalizeDedicatedChannelSettings(normalized);
  return normalized;
}

async function saveGuildSettingsToRedis(guildId, settings) {
  const redis = await ensureRedisConnection();
  const key = `guildsettings:${guildId}`;
  let current = await getGuildSettingsFromRedis(guildId);
  if (!current) current = {};
  const merged = normalizeGuildSettingsObject({ ...current, ...settings });
  await redis.set(key, JSON.stringify(merged));
  return merged;
}

async function getGuildSettingsFromRedis(guildId) {
  const redis = await ensureRedisConnection();
  const key = `guildsettings:${guildId}`;
  const val = await redis.get(key);
  const parsed = val ? JSON.parse(val) : {};
  return normalizeGuildSettingsObject(parsed);
}

function hasEssentialSettings(normalized) {
  const rolesEmpty = !Array.isArray(normalized.notification_roles) || normalized.notification_roles.length === 0;
  const noSingleRole = !normalized.notification_role;
  const noChannel = !normalized.recruit_channel && (!Array.isArray(normalized.recruit_channels) || normalized.recruit_channels.length === 0);
  
  return !rolesEmpty || !noSingleRole || !noChannel;
}

function mergeRecruitStyle(merged, fromApi, normalized) {
  if (normalized && typeof normalized.recruit_style === 'string' && !Object.prototype.hasOwnProperty.call(fromApi, 'recruit_style')) {
    merged.recruit_style = normalized.recruit_style;
  }
}

function mergeDedicatedChannelEnabled(merged, fromApi, normalized) {
  if (!Object.prototype.hasOwnProperty.call(fromApi || {}, 'enable_dedicated_channel')) {
    merged.enable_dedicated_channel = normalized.enable_dedicated_channel;
  }
}

function mergeDedicatedChannelCategory(merged, fromApi, normalized) {
  if (!Object.prototype.hasOwnProperty.call(fromApi || {}, 'dedicated_channel_category_id')) {
    merged.dedicated_channel_category_id = normalized.dedicated_channel_category_id || null;
  }
}

function mergeRecruitChannels(merged, fromApi, normalized) {
  if (!Object.prototype.hasOwnProperty.call(fromApi || {}, 'recruit_channels') && Array.isArray(normalized.recruit_channels)) {
    merged.recruit_channels = normalized.recruit_channels;
    if (!merged.recruit_channel && normalized.recruit_channels.length > 0) {
      merged.recruit_channel = normalized.recruit_channels[0];
    }
  }
}

function mergeApiResponseWithCache(fromApi, normalized) {
  const merged = normalizeGuildSettingsObject({ ...fromApi });
  mergeRecruitStyle(merged, fromApi, normalized);
  mergeDedicatedChannelEnabled(merged, fromApi, normalized);
  mergeDedicatedChannelCategory(merged, fromApi, normalized);
  mergeRecruitChannels(merged, fromApi, normalized);
  return merged;
}

async function fetchAndCacheFromApi(guildId, redis, key, normalized) {
  try {
    const apiBase = (config && config.BACKEND_API_URL) ? config.BACKEND_API_URL.replace(/\/$/, '') : '';
    const path = `${apiBase}/api/guild-settings/${guildId}`;
    console.log(`[getGuildSettingsSmart] Fetching from API: ${path}`);
    const fromApi = await backendFetch(path, { method: 'GET' });
    console.log(`[getGuildSettingsSmart] API response for guild ${guildId}:`, fromApi);
    
    if (fromApi && typeof fromApi === 'object') {
      const merged = mergeApiResponseWithCache(fromApi, normalized);
      await redis.set(key, JSON.stringify(merged));
      console.log(`[getGuildSettingsSmart] Cached API result for guild ${guildId}`);
      return merged;
    }
  } catch (e) {
    console.error(`[getGuildSettingsSmart] API fetch failed for guild ${guildId}:`, e?.message || e);
  }
  return null;
}

function getAndParseRedisSettings(redis, key) {
  return redis.get(key).then(val => {
    const parsed = val ? JSON.parse(val) : {};
    const normalized = normalizeGuildSettingsObject(parsed);
    return { val, normalized };
  });
}

function shouldFetchFromApi(val, normalized) {
  return !val || !hasEssentialSettings(normalized);
}

// Hybrid getter: prefer Redis, but if missing/empty, fetch from backend API and cache.
async function getGuildSettingsSmart(guildId) {
  const redis = await ensureRedisConnection();
  const key = `guildsettings:${guildId}`;
  const { val, normalized } = await getAndParseRedisSettings(redis, key);

  console.log(`[getGuildSettingsSmart] Guild ${guildId}: Redis val=${!!val}, hasEssential=${hasEssentialSettings(normalized)}`);

  if (shouldFetchFromApi(val, normalized)) {
    const apiResult = await fetchAndCacheFromApi(guildId, redis, key, normalized);
    if (apiResult) return apiResult;
  }
  
  console.log(`[getGuildSettingsSmart] Returning for guild ${guildId}:`, normalized);
  return normalized;
}

function buildFinalizePayload(guildId, settings) {
  const payload = { guildId };
  const allowedKeys = ['update_channel', 'recruit_channel', 'recruit_channels', 'defaultColor', 'defaultTitle', 'recruit_style', 'enable_dedicated_channel', 'dedicated_channel_category_id'];
  
  for (const k of allowedKeys) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
      const v = settings[k];
      if (v !== undefined) payload[k] = v;
    }
  }
  
  const notificationRoles = Array.isArray(settings.notification_roles)
    ? settings.notification_roles.filter(Boolean).map(String)
    : [];
  payload.notification_roles = notificationRoles;
  payload.notification_role = notificationRoles.length > 0 ? notificationRoles[0] : null;
  
  return payload;
}

function buildWebhookEmbed(guildId, payload) {
  const recruitChannels = Array.isArray(payload.recruit_channels) && payload.recruit_channels.length > 0
    ? payload.recruit_channels.map(id => `<#${id}>`).join(', ')
    : (payload.recruit_channel ? `<#${payload.recruit_channel}>` : '未設定');
  
  const notifRoles = Array.isArray(payload.notification_roles) && payload.notification_roles.length > 0
    ? payload.notification_roles.map(r => r === 'everyone' ? '@everyone' : r === 'here' ? '@here' : `<@&${r}>`).join(', ')
    : '未設定';
  
  const fields = [
    { name: 'サーバーID', value: guildId, inline: true },
    { name: '募集チャンネル', value: recruitChannels, inline: false },
    { name: '通知ロール', value: notifRoles, inline: false },
    { name: '既定タイトル', value: payload.defaultTitle || '未設定', inline: true },
    { name: '既定カラー', value: payload.defaultColor ? `#${payload.defaultColor}` : '未設定', inline: true },
    { name: '募集スタイル', value: payload.recruit_style === 'simple' ? 'シンプル' : '画像パネル', inline: true }
  ];

  if (payload.update_channel) {
    fields.push({
      name: 'アップデート通知チャンネル',
      value: `<#${payload.update_channel}>`,
      inline: true
    });
  }

  return {
    title: '⚙️ 募集設定が保存されました',
    color: parseInt('5865F2', 16),
    fields,
    timestamp: new Date().toISOString()
  };
}

async function sendWebhookNotification(guildId, payload) {
  try {
    const webhookUrl = 'https://discord.com/api/webhooks/1426044588740710460/RElua00Jvi-937tbGtwv9wfq123mdff097HvaJgb-qILNsc79yzei9x8vZrM2OKYsETI';
    const webhookEmbed = buildWebhookEmbed(guildId, payload);

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [webhookEmbed] })
    });
    
    console.log('[webhook] 募集設定保存通知を送信しました:', guildId);
  } catch (webhookErr) {
    console.error('[webhook] 設定保存通知の送信に失敗:', webhookErr?.message || webhookErr);
  }
}

async function fetchGuildSettingsFromApi(guildId) {
  const apiBase = (config && config.BACKEND_API_URL) ? config.BACKEND_API_URL.replace(/\/$/, '') : '';
  const path = `${apiBase}/api/guild-settings/${guildId}`;
  return await backendFetch(path, { method: 'GET' });
}

function shouldPreserveRecruitStyle(fromApi, settings) {
  if (typeof settings.recruit_style !== 'string') return false;
  
  const apiHasStyle = fromApi && Object.prototype.hasOwnProperty.call(fromApi, 'recruit_style');
  const apiStyle = apiHasStyle ? fromApi.recruit_style : undefined;
  const isApiDefault = apiStyle === undefined || apiStyle === null || apiStyle === 'image';
  
  return !apiHasStyle || isApiDefault;
}

function mergeRecruitStyleAfterFinalize(merged, fromApi, settings) {
  if (shouldPreserveRecruitStyle(fromApi, settings)) {
    merged.recruit_style = settings.recruit_style;
  }
}

async function refetchAndRecacheSettings(guildId, settings, redis, key) {
  try {
    const fromApi = await fetchGuildSettingsFromApi(guildId);
    let merged = normalizeGuildSettingsObject(fromApi || {});
    
    mergeRecruitStyleAfterFinalize(merged, fromApi, settings);
    
    await redis.set(key, JSON.stringify(merged));
    console.log(`[finalizeGuildSettings] Re-cached settings for guild ${guildId} after finalize`);
  } catch (refetchErr) {
    console.warn('[finalizeGuildSettings] Refetch after finalize failed; settings will be re-fetched lazily', refetchErr?.message || refetchErr);
  }
}

function logFinalizeError(url, payload, err) {
  try {
    console.error('[finalizeGuildSettings] backend request failed', {
      url,
      payloadSummary: {
        guildId: payload.guildId,
        hasNotificationRoles: Array.isArray(payload.notification_roles) ? payload.notification_roles.length : 0,
        notification_role: payload.notification_role || null,
        recruit_channel: payload.recruit_channel || null,
        update_channel: payload.update_channel || null,
        defaultColor: payload.defaultColor || null,
        defaultTitle: payload.defaultTitle || null,
        recruit_style: payload.recruit_style || null,
      },
      errorStatus: err && err.status,
      errorBody: err && err.body
    });
  } catch (logErr) {
    console.error('[finalizeGuildSettings] failed to log error details', logErr);
  }
}

async function buildFinalizeRequest(guildId) {
  const settings = normalizeGuildSettingsObject(await getGuildSettingsFromRedis(guildId));
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/guild-settings/finalize`;
  const payload = buildFinalizePayload(guildId, settings);
  const headers = { 'Content-Type': 'application/json' };
  return { settings, url, payload, headers };
}

async function handleFinalizeSuccess(guildId, settings, payload) {
  const redis = await ensureRedisConnection();
  const key = `guildsettings:${guildId}`;
  await redis.del(key);
  console.log(`[finalizeGuildSettings] Redis cache cleared for guild ${guildId}`);
  
  await sendWebhookNotification(guildId, payload);
  await refetchAndRecacheSettings(guildId, settings, redis, key);
}

async function finalizeGuildSettings(guildId) {
  if (!guildId) throw new Error('Guild ID is required');
  
  const { settings, url, payload, headers } = await buildFinalizeRequest(guildId);
  
  try {
    const body = await backendFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    
    if (body && body.ok) {
      await handleFinalizeSuccess(guildId, settings, payload);
    }
    
    return body;
  } catch (err) {
    logFinalizeError(url, payload, err);
    throw err;
  }
}

async function deleteGuildSettings(guildId) {
  try {
    const response = await backendFetch(`/api/guild-settings/${encodeURIComponent(guildId)}`, {
      method: 'DELETE'
    });
    console.log(`[deleteGuildSettings] Successfully deleted settings for guild ${guildId}`);
    return { ok: true, body: response };
  } catch (error) {
    console.error(`[deleteGuildSettings] Error deleting settings for guild ${guildId}:`, error?.message);
    throw error;
  }
}

module.exports = {
  normalizeGuildSettingsObject,
  saveGuildSettingsToRedis,
  getGuildSettingsFromRedis,
  getGuildSettingsSmart,
  finalizeGuildSettings,
  deleteGuildSettings,
};
