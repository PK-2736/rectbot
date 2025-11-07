const config = require('../../config');
const backendFetch = require('../backendFetch');
const { ensureRedisConnection } = require('./redis');

function normalizeGuildSettingsObject(input) {
  const normalized = { ...(input || {}) };
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

async function finalizeGuildSettings(guildId) {
  if (!guildId) throw new Error('Guild ID is required');
  const settings = normalizeGuildSettingsObject(await getGuildSettingsFromRedis(guildId));
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/guild-settings/finalize`;
  const payload = { guildId };
  const allowedKeys = ['update_channel', 'recruit_channel', 'defaultColor', 'defaultTitle'];
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
  finalizeGuildSettings,
};
