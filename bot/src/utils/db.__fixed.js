// Clean single-definition db module (db.__fixed.js)
const config = require('../config');
const Redis = require('ioredis');
const EventEmitter = require('events');
const { createClient } = require('@supabase/supabase-js');
const backendFetch = require('./backendFetch');

const dbEvents = new EventEmitter();
let lastCleanup = { lastRun: null, deletedRecruitCount: 0, deletedParticipantCount: 0, error: null };

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0
});

const RECRUIT_TTL_SECONDS = Number(process.env.REDIS_RECRUIT_TTL_SECONDS || 8 * 60 * 60);

async function saveGuildSettingsToRedis(guildId, settings) {
  const key = `guildsettings:${guildId}`;
  let current = await getGuildSettingsFromRedis(guildId);
  if (!current) current = {};
  const merged = { ...current, ...settings };
  await redis.set(key, JSON.stringify(merged));
  return merged;
}

async function getGuildSettingsFromRedis(guildId) {
  const key = `guildsettings:${guildId}`;
  const val = await redis.get(key);
  return val ? JSON.parse(val) : {};
}

async function finalizeGuildSettings(guildId) {
  const settings = await getGuildSettingsFromRedis(guildId);
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/guild-settings/finalize`;
  const payload = { guildId };
  const allowedKeys = ['update_channel', 'recruit_channel', 'defaultColor', 'notification_role', 'defaultTitle'];
  for (const k of allowedKeys) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
      const v = settings[k];
      if (v !== undefined && v !== null) payload[k] = v;
    }
  }
  const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
  const headers = { 'Content-Type': 'application/json' };
  if (svc) headers['Authorization'] = `Bearer ${svc}`;
  const res = await backendFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  let text = '';
  try { text = await res.text(); } catch (e) { text = ''; }
  let body = null; try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  if (!res.ok) throw new Error(`API error: ${res.status} - ${text}`);
  return body;
}

async function saveRecruitToRedis(recruitId, data) {
  await redis.set(`recruit:${recruitId}`, JSON.stringify(data), 'EX', RECRUIT_TTL_SECONDS);
}

async function getRecruitFromRedis(recruitId) {
  const val = await redis.get(`recruit:${recruitId}`);
  return val ? JSON.parse(val) : null;
}

async function listRecruitIdsFromRedis() { return await redis.keys('recruit:*'); }

async function listRecruitsFromRedis() {
  const keys = await listRecruitIdsFromRedis();
  if (keys.length === 0) return [];
  const vals = await redis.mget(keys);
  return vals.map(v => v ? JSON.parse(v) : null).filter(Boolean);
}

async function deleteRecruitFromRedis(recruitId) {
  await redis.del(`recruit:${recruitId}`);
  try { dbEvents.emit('recruitDeleted', { recruitId, timestamp: new Date().toISOString() }); } catch (e) {}
}

async function saveParticipantsToRedis(messageId, participants) {
  await redis.set(`participants:${messageId}`, JSON.stringify(participants), 'EX', RECRUIT_TTL_SECONDS);
}

async function getParticipantsFromRedis(messageId) {
  const val = await redis.get(`participants:${messageId}`);
  return val ? JSON.parse(val) : [];
}

async function deleteParticipantsFromRedis(messageId) {
  await redis.del(`participants:${messageId}`);
  try { dbEvents.emit('participantsDeleted', { messageId, timestamp: new Date().toISOString() }); } catch (e) {}
}

async function cleanupExpiredRecruits() {
  const result = { deletedRecruitCount: 0, deletedParticipantCount: 0, timestamp: new Date().toISOString(), error: null };
  try {
    const recruitKeys = await listRecruitIdsFromRedis();
    for (const key of recruitKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redis.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) { await redis.del(key); result.deletedRecruitCount += 1; try { const rid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('recruitDeleted', { recruitId: rid, key, timestamp: new Date().toISOString() }); } catch (e) {} }
    }
    const participantKeys = await redis.keys('participants:*');
    for (const key of participantKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redis.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) { await redis.del(key); result.deletedParticipantCount += 1; try { const mid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('participantsDeleted', { messageId: mid, key, timestamp: new Date().toISOString() }); } catch (e) {} }
    }
    lastCleanup = { lastRun: result.timestamp, deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: null };
    try { dbEvents.emit('cleanup', lastCleanup); } catch (e) {}
    return result;
  } catch (e) {
    lastCleanup = { lastRun: new Date().toISOString(), deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: e?.message || String(e) };
    try { dbEvents.emit('cleanup', lastCleanup); } catch (e2) {}
    return { ...result, error: e?.message || String(e) };
  }
}

cleanupExpiredRecruits().catch(() => {});

const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 1000 * 60 * 60);
setInterval(() => { cleanupExpiredRecruits().catch(e => console.warn('periodic cleanup failed:', e?.message || e)); }, CLEANUP_INTERVAL_MS);

async function runCleanupNow() { return await cleanupExpiredRecruits(); }
function getLastCleanupStatus() { return lastCleanup; }

async function pushRecruitToWebAPI(recruitData) {
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment`;
  try {
    const payload = JSON.stringify(recruitData);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    let text = '';
    try { text = await res.text(); } catch (e) { text = ''; }
    let body = null; try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    if (!res.ok) return { ok: false, status: res.status, body };
    return { ok: true, status: res.status, body };
  } catch (err) { console.error('pushRecruitToWebAPI error:', err?.message || err); return { ok: false, status: null, error: err?.message || String(err) }; }
}

let _supabaseClient = null;
function getSupabase() {
  if (_supabaseClient) return _supabaseClient;
  try {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) { console.warn('getSupabase: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured'); return null; }
    _supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
    return _supabaseClient;
  } catch (e) { console.warn('getSupabase: failed to create client', e?.message || e); return null; }
}

async function saveRecruitStatus(serverId, channelId, messageId, startTime) {
  const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverId, channelId, messageId, startTime }) });
  return res.json();
}

async function saveRecruitmentData(guildId, channelId, messageId, guildName, channelName, recruitData) {
  const recruitId = recruitData.recruitId || String(messageId).slice(-8);
  const data = { guild_id: guildId, channel_id: channelId, message_id: messageId, guild_name: guildName, channel_name: channelName, status: 'recruiting', start_time: new Date().toISOString(), content: recruitData.content, participants_count: parseInt(recruitData.participants), start_game_time: recruitData.startTime, vc: recruitData.vc, note: recruitData.note, recruiterId: recruitData.recruiterId, recruitId };
  const res = await backendFetch(`${config.BACKEND_API_URL}/api/recruitment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return await res.json();
}

async function deleteRecruitStatus(serverId) { const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status?serverId=${serverId}`, { method: 'DELETE' }); return res.json(); }

async function deleteRecruitmentData(messageId) {
  try {
  const res = await backendFetch(`${config.BACKEND_API_URL}/api/recruitment/${messageId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
    const status = res.status; let body = null; try { body = await res.json(); } catch (_) { body = await res.text().catch(()=>null); }
    if (!res.ok) {
      if (status === 404) return { ok: false, status, body, warning: 'Recruitment not found' };
      return { ok: false, status, body, error: typeof body === 'string' ? body : (body && body.error) || JSON.stringify(body) };
    }
    return { ok: true, status, body: body || null };
  } catch (error) { return { ok: false, error: error?.message || String(error) }; }
}

async function updateRecruitmentStatus(messageId, status, endTime = null) {
  const updateData = { status: status, ...(endTime && { end_time: endTime }) };
  const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
  const res = await backendFetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
  if (!res.ok) {
    const errorText = await res.text();
    if (res.status === 404) return { warning: 'Recruitment data not found', messageId };
    throw new Error(`API error: ${res.status} - ${errorText}`);
  }
  return await res.json();
}

async function updateRecruitmentData(messageId, recruitData) {
  const updateData = { title: recruitData.title || null, content: recruitData.content, participants_count: parseInt(recruitData.participants), start_game_time: recruitData.startTime, vc: recruitData.vc, note: recruitData.note || null };
  const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
  const res = await backendFetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
  if (!res.ok) {
    const errorText = await res.text();
    if (res.status === 404) { return { warning: 'Recruitment data not found' }; }
    throw new Error(`API error: ${res.status} - ${errorText}`);
  }
  return await res.json();
}

async function getActiveRecruits() { const res = await fetch(`${config.BACKEND_API_URL}/api/active-recruits`); return await res.json(); }

module.exports = {
  getSupabase,
  saveRecruitStatus,
  deleteRecruitStatus,
  getActiveRecruits,
  saveRecruitmentData,
  deleteRecruitmentData,
  updateRecruitmentStatus,
  updateRecruitmentData,
  saveRecruitToRedis,
  getRecruitFromRedis,
  listRecruitIdsFromRedis,
  listRecruitsFromRedis,
  deleteRecruitFromRedis,
  pushRecruitToWebAPI,
  saveGuildSettingsToRedis,
  getGuildSettingsFromRedis,
  finalizeGuildSettings,
  getGuildSettings: getGuildSettingsFromRedis,
  saveParticipantsToRedis,
  getParticipantsFromRedis,
  deleteParticipantsFromRedis,
  RECRUIT_TTL_SECONDS,
  cleanupExpiredRecruits,
  dbEvents,
  runCleanupNow,
  getLastCleanupStatus
};
