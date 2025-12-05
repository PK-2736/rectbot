const config = require('../../config');
const backendFetch = require('../backendFetch');
const { ensureRedisConnection } = require('./redis');

function normalizeGuildSettingsObject(input) {
  const normalized = { ...(input || {}) };
  // Recruit style: 'image' (default) or 'simple'
  if (Object.prototype.hasOwnProperty.call(normalized, 'recruit_style')) {
    const v = normalized.recruit_style;
    normalized.recruit_style = v === 'simple' ? 'simple' : 'image';
  } else {
    normalized.recruit_style = 'image';
  }
  const hasRolesArray = Object.prototype.hasOwnProperty.call(normalized, 'notification_roles');
  const hasRoleString = Object.prototype.hasOwnProperty.call(normalized, 'notification_role');

  if (hasRolesArray) {
    const rawArray = Array.isArray(normalized.notification_roles)
      ? normalized.notification_roles.filter(Boolean).map(String)
      : [];
    const uniqueRoles = [...new Set(rawArray)].slice(0, 25);
    normalized.notification_roles = uniqueRoles;
    if (!hasRoleString || normalized.notification_role === undefined) {
      normalized.notification_role = uniqueRoles.length > 0 ? uniqueRoles[0] : null;
    } else if (normalized.notification_role !== null) {
      normalized.notification_role = String(normalized.notification_role);
      if (uniqueRoles.length === 0 && normalized.notification_role) {
        normalized.notification_roles = [normalized.notification_role];
      }
    }
    if (uniqueRoles.length === 0) {
      normalized.notification_role = null;
    }
  } else if (hasRoleString) {
    const roleId = normalized.notification_role ? String(normalized.notification_role) : null;
    normalized.notification_role = roleId;
    normalized.notification_roles = roleId ? [roleId] : [];
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'recruit_channel')) {
    normalized.recruit_channel = normalized.recruit_channel ? String(normalized.recruit_channel) : null;
  }

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

// Hybrid getter: prefer Redis, but if missing/empty, fetch from backend API and cache.
async function getGuildSettingsSmart(guildId) {
  const redis = await ensureRedisConnection();
  const key = `guildsettings:${guildId}`;
  let val = await redis.get(key);
  let parsed = val ? JSON.parse(val) : {};
  let normalized = normalizeGuildSettingsObject(parsed);

  const rolesEmpty = !Array.isArray(normalized.notification_roles) || normalized.notification_roles.length === 0;
  const noSingleRole = !normalized.notification_role;
  const noChannel = !normalized.recruit_channel;

  console.log(`[getGuildSettingsSmart] Guild ${guildId}: Redis val=${!!val}, rolesEmpty=${rolesEmpty}, noSingleRole=${noSingleRole}, noChannel=${noChannel}`);

  if (!val || (rolesEmpty && noSingleRole && noChannel)) {
    try {
      const apiBase = (config && config.BACKEND_API_URL) ? config.BACKEND_API_URL.replace(/\/$/, '') : '';
      const path = `${apiBase}/api/guild-settings/${guildId}`;
      console.log(`[getGuildSettingsSmart] Fetching from API: ${path}`);
      const fromApi = await backendFetch(path, { method: 'GET' });
      console.log(`[getGuildSettingsSmart] API response for guild ${guildId}:`, fromApi);
      if (fromApi && typeof fromApi === 'object') {
        // 既存のrecruit_styleがある場合はAPIが欠落していても上書きしない
        const merged = normalizeGuildSettingsObject({ ...fromApi });
        if (normalized && typeof normalized.recruit_style === 'string' && !Object.prototype.hasOwnProperty.call(fromApi, 'recruit_style')) {
          merged.recruit_style = normalized.recruit_style;
        }
        await redis.set(key, JSON.stringify(merged));
        console.log(`[getGuildSettingsSmart] Cached API result for guild ${guildId}`);
        return merged;
      }
    } catch (e) {
      console.error(`[getGuildSettingsSmart] API fetch failed for guild ${guildId}:`, e?.message || e);
    }
  }
  console.log(`[getGuildSettingsSmart] Returning for guild ${guildId}:`, normalized);
  return normalized;
}

async function finalizeGuildSettings(guildId) {
  if (!guildId) throw new Error('Guild ID is required');
  const settings = normalizeGuildSettingsObject(await getGuildSettingsFromRedis(guildId));
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/guild-settings/finalize`;
  const payload = { guildId };
  // Supabaseへ保存するキーに recruit_style を追加
  const allowedKeys = ['update_channel', 'recruit_channel', 'defaultColor', 'defaultTitle', 'recruit_style'];
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

  const headers = { 'Content-Type': 'application/json' };
  try {
    // backendFetch returns parsed JSON on success, or throws an Error with status/body on non-OK
    const body = await backendFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    // Supabase保存成功したらRedisキャッシュを削除（最新をAPIから再取得する前提）
    if (body && body.ok) {
      const redis = await ensureRedisConnection();
      const key = `guildsettings:${guildId}`;
      await redis.del(key);
      console.log(`[finalizeGuildSettings] Redis cache cleared for guild ${guildId}`);
      // 成功後にAPIから最新設定を再取得し、recruit_style を欠落させないようにローカル設定で補完して再キャッシュ
      try {
        const apiBase = (config && config.BACKEND_API_URL) ? config.BACKEND_API_URL.replace(/\/$/, '') : '';
        const path = `${apiBase}/api/guild-settings/${guildId}`;
        const fromApi = await backendFetch(path, { method: 'GET' });
        let merged = normalizeGuildSettingsObject(fromApi || {});
        if (!Object.prototype.hasOwnProperty.call(fromApi || {}, 'recruit_style') && typeof settings.recruit_style === 'string') {
          merged.recruit_style = settings.recruit_style;
        }
        await redis.set(key, JSON.stringify(merged));
        console.log(`[finalizeGuildSettings] Re-cached settings for guild ${guildId} after finalize`);
      } catch (refetchErr) {
        console.warn('[finalizeGuildSettings] Refetch after finalize failed; settings will be re-fetched lazily', refetchErr?.message || refetchErr);
      }
    }
    return body;
  } catch (err) {
    // Enrich logs for easier debugging of 500 errors on the backend.
    try {
      console.error('[finalizeGuildSettings] backend request failed', {
        url,
        payloadSummary: {
          guildId,
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
    // Re-throw original error for upstream handling
    throw err;
  }
}

module.exports = {
  normalizeGuildSettingsObject,
  saveGuildSettingsToRedis,
  getGuildSettingsFromRedis,
  getGuildSettingsSmart,
  finalizeGuildSettings,
};
