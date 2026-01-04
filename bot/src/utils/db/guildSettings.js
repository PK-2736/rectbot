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

  if (Object.prototype.hasOwnProperty.call(normalized, 'recruit_channels')) {
    const arr = Array.isArray(normalized.recruit_channels) ? normalized.recruit_channels : [];
    const uniqueChannels = [...new Set(arr.filter(Boolean).map(String))].slice(0, 25);
    normalized.recruit_channels = uniqueChannels;
    if (!normalized.recruit_channel && uniqueChannels.length > 0) {
      normalized.recruit_channel = uniqueChannels[0];
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'enable_dedicated_channel')) {
    normalized.enable_dedicated_channel = !!normalized.enable_dedicated_channel;
  } else {
    normalized.enable_dedicated_channel = false;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'dedicated_channel_category_id')) {
    normalized.dedicated_channel_category_id = normalized.dedicated_channel_category_id ? String(normalized.dedicated_channel_category_id) : null;
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
  const noChannel = !normalized.recruit_channel && (!Array.isArray(normalized.recruit_channels) || normalized.recruit_channels.length === 0);

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
        // Preserve cached dedicated channel toggle/category if API lacks them
        if (!Object.prototype.hasOwnProperty.call(fromApi || {}, 'enable_dedicated_channel')) {
          merged.enable_dedicated_channel = normalized.enable_dedicated_channel;
        }
        if (!Object.prototype.hasOwnProperty.call(fromApi || {}, 'dedicated_channel_category_id')) {
          merged.dedicated_channel_category_id = normalized.dedicated_channel_category_id || null;
        }
        if (!Object.prototype.hasOwnProperty.call(fromApi || {}, 'recruit_channels') && Array.isArray(normalized.recruit_channels)) {
          merged.recruit_channels = normalized.recruit_channels;
          if (!merged.recruit_channel && normalized.recruit_channels.length > 0) merged.recruit_channel = normalized.recruit_channels[0];
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
      
      // Webhook通知を送信（設定保存時）
      try {
        const webhookUrl = 'https://discord.com/api/webhooks/1426044588740710460/RElua00Jvi-937tbGtwv9wfq123mdff097HvaJgb-qILNsc79yzei9x8vZrM2OKYsETI';
        
        const recruitChannels = Array.isArray(payload.recruit_channels) && payload.recruit_channels.length > 0
          ? payload.recruit_channels.map(id => `<#${id}>`).join(', ')
          : (payload.recruit_channel ? `<#${payload.recruit_channel}>` : '未設定');
        
        const notifRoles = Array.isArray(payload.notification_roles) && payload.notification_roles.length > 0
          ? payload.notification_roles.map(r => r === 'everyone' ? '@everyone' : r === 'here' ? '@here' : `<@&${r}>`).join(', ')
          : '未設定';
        
        const webhookEmbed = {
          title: '⚙️ 募集設定が保存されました',
          color: parseInt('5865F2', 16),
          fields: [
            {
              name: 'サーバーID',
              value: guildId,
              inline: true
            },
            {
              name: '募集チャンネル',
              value: recruitChannels,
              inline: false
            },
            {
              name: '通知ロール',
              value: notifRoles,
              inline: false
            },
            {
              name: '既定タイトル',
              value: payload.defaultTitle || '未設定',
              inline: true
            },
            {
              name: '既定カラー',
              value: payload.defaultColor ? `#${payload.defaultColor}` : '未設定',
              inline: true
            },
            {
              name: '募集スタイル',
              value: payload.recruit_style === 'simple' ? 'シンプル' : '画像パネル',
              inline: true
            }
          ],
          timestamp: new Date().toISOString()
        };

        if (payload.update_channel) {
          webhookEmbed.fields.push({
            name: 'アップデート通知チャンネル',
            value: `<#${payload.update_channel}>`,
            inline: true
          });
        }

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [webhookEmbed]
          })
        });
        console.log('[webhook] 募集設定保存通知を送信しました:', guildId);
      } catch (webhookErr) {
        console.error('[webhook] 設定保存通知の送信に失敗:', webhookErr?.message || webhookErr);
      }
      
      // 成功後にAPIから最新設定を再取得し、recruit_style を欠落させないようにローカル設定で補完して再キャッシュ
      try {
        const apiBase = (config && config.BACKEND_API_URL) ? config.BACKEND_API_URL.replace(/\/$/, '') : '';
        const path = `${apiBase}/api/guild-settings/${guildId}`;
        const fromApi = await backendFetch(path, { method: 'GET' });
        let merged = normalizeGuildSettingsObject(fromApi || {});

        // If API does not persist recruit_style (or returns the default), keep the user's cached value to avoid regression.
        if (typeof settings.recruit_style === 'string') {
          const apiHasStyle = fromApi && Object.prototype.hasOwnProperty.call(fromApi, 'recruit_style');
          const apiStyle = apiHasStyle ? fromApi.recruit_style : undefined;
          const isApiDefault = apiStyle === undefined || apiStyle === null || apiStyle === 'image';
          if (!apiHasStyle || isApiDefault) {
            merged.recruit_style = settings.recruit_style;
          }
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
