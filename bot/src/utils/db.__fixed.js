// Clean single-definition db module (db.__fixed.js)
const config = require('../config');
const Redis = require('ioredis');
const EventEmitter = require('events');
const { createClient } = require('@supabase/supabase-js');
const backendFetch = require('./backendFetch');

const dbEvents = new EventEmitter();
let lastCleanup = { lastRun: null, deletedRecruitCount: 0, deletedParticipantCount: 0, error: null };

let redis;

try {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully');
  });

  redis.on('ready', () => {
    console.log('Redis ready');
  });

} catch (error) {
  console.error('Failed to initialize Redis:', error);
  redis = null;
}

const RECRUIT_TTL_SECONDS = Number(process.env.REDIS_RECRUIT_TTL_SECONDS || 8 * 60 * 60);

function normalizeRecruitId(messageOrRecruitId) {
  if (!messageOrRecruitId) return '';
  const str = String(messageOrRecruitId);
  return str.length > 8 ? str.slice(-8) : str;
}

// Helper function to ensure Redis connection
async function ensureRedisConnection() {
  if (!redis) {
    console.error('Redis client is not initialized - check Redis configuration');
    throw new Error('Redis client is not initialized');
  }
  
  console.log(`Redis status: ${redis.status}`);
  
  if (redis.status !== 'ready') {
    console.log('Redis not ready, attempting to connect...');
    try {
      await redis.connect();
      console.log('Redis connection established');
    } catch (error) {
      console.error('Redis connection failed:', error);
      throw new Error(`Redis connection failed: ${error.message}`);
    }
  }
  
  return redis;
}

async function saveGuildSettingsToRedis(guildId, settings) {
  const redisClient = await ensureRedisConnection();
  const key = `guildsettings:${guildId}`;
  let current = await getGuildSettingsFromRedis(guildId);
  if (!current) current = {};
  const merged = { ...current, ...settings };
  await redisClient.set(key, JSON.stringify(merged));
  return merged;
}

async function getGuildSettingsFromRedis(guildId) {
  const redisClient = await ensureRedisConnection();
  const key = `guildsettings:${guildId}`;
  const val = await redisClient.get(key);
  return val ? JSON.parse(val) : {};
}

async function finalizeGuildSettings(guildId) {
  try {
    if (!guildId) {
      throw new Error('Guild ID is required');
    }

    console.log(`Finalizing guild settings for guild: ${guildId}`);
    
    const settings = await getGuildSettingsFromRedis(guildId);
    console.log(`Retrieved settings from Redis:`, settings);
    
    const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/guild-settings/finalize`;
    const payload = { guildId };
    const allowedKeys = ['update_channel', 'recruit_channel', 'defaultColor', 'notification_role', 'defaultTitle'];
    
    for (const k of allowedKeys) {
      if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
        const v = settings[k];
        if (v !== undefined && v !== null) payload[k] = v;
      }
    }
    
    console.log(`Sending payload to backend:`, payload);
    console.log(`Backend URL:`, url);
    
    // backendFetch が自動的に SERVICE_TOKEN ヘッダーを追加
    const headers = { 'Content-Type': 'application/json' };
    
    const res = await backendFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    let text = '';
    try { text = await res.text(); } catch (e) { text = ''; }
    let body = null; try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    
    if (!res.ok) {
      console.error(`Backend API error: ${res.status} - ${text}`);
      throw new Error(`API error: ${res.status} - ${text}`);
    }
    
    console.log(`Backend response:`, body);
    return body;
    
  } catch (error) {
    console.error(`Error in finalizeGuildSettings for guild ${guildId}:`, error);
    console.error(`Error stack:`, error.stack);
    throw error;
  }
}

async function saveRecruitToRedis(recruitId, data) {
  const redisClient = await ensureRedisConnection();
  await redisClient.set(`recruit:${recruitId}`, JSON.stringify(data), 'EX', RECRUIT_TTL_SECONDS);
}

async function getRecruitFromRedis(recruitId) {
  const redisClient = await ensureRedisConnection();
  const val = await redisClient.get(`recruit:${recruitId}`);
  return val ? JSON.parse(val) : null;
}

async function getRecruitFromWorker(recruitId) {
  const rid = normalizeRecruitId(recruitId);
  if (!rid) {
    return { ok: false, error: 'recruitId_required' };
  }
  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/${encodeURIComponent(rid)}`);
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

// Use SCAN to iterate keys safely in production instead of KEYS
async function scanKeys(pattern) {
  const redisClient = await ensureRedisConnection();
  const stream = redisClient.scanStream({ match: pattern, count: 100 });
  const keys = [];
  return await new Promise((resolve, reject) => {
    stream.on('data', (resultKeys) => {
      for (const k of resultKeys) keys.push(k);
    });
    stream.on('end', () => resolve(keys));
    stream.on('error', (err) => reject(err));
  });
}

async function listRecruitIdsFromRedis() { return await scanKeys('recruit:*'); }

async function listRecruitsFromRedis() {
  const keys = await listRecruitIdsFromRedis();
  if (keys.length === 0) return [];
  const redisClient = await ensureRedisConnection();
  const vals = await redisClient.mget(keys);
  
  // 参加者情報も取得して統合
  const recruits = vals.map(v => v ? JSON.parse(v) : null).filter(Boolean);
  
  // 各募集の参加者情報を取得
  for (const recruit of recruits) {
    if (recruit.messageId) {
      try {
        const participants = await getParticipantsFromRedis(recruit.messageId);
        recruit.participantsList = participants;
        recruit.currentParticipants = participants.length;
      } catch (e) {
        console.warn(`Failed to get participants for ${recruit.messageId}:`, e.message);
        recruit.participantsList = [];
        recruit.currentParticipants = 0;
      }
    } else {
      recruit.participantsList = [];
      recruit.currentParticipants = 0;
    }
  }
  
  return recruits;
}

async function deleteRecruitFromRedis(recruitId) {
  const redisClient = await ensureRedisConnection();
  await redisClient.del(`recruit:${recruitId}`);
  try { dbEvents.emit('recruitDeleted', { recruitId, timestamp: new Date().toISOString() }); } catch (e) {}
}

async function saveParticipantsToRedis(messageId, participants) {
  const redisClient = await ensureRedisConnection();
  await redisClient.set(`participants:${messageId}`, JSON.stringify(participants), 'EX', RECRUIT_TTL_SECONDS);
}

async function getParticipantsFromRedis(messageId) {
  const redisClient = await ensureRedisConnection();
  const val = await redisClient.get(`participants:${messageId}`);
  return val ? JSON.parse(val) : [];
}

async function deleteParticipantsFromRedis(messageId) {
  const redisClient = await ensureRedisConnection();
  await redisClient.del(`participants:${messageId}`);
  try { dbEvents.emit('participantsDeleted', { messageId, timestamp: new Date().toISOString() }); } catch (e) {}
}

async function cleanupExpiredRecruits() {
  const result = { deletedRecruitCount: 0, deletedParticipantCount: 0, timestamp: new Date().toISOString(), error: null };
  try {
    const redisClient = await ensureRedisConnection();
    const recruitKeys = await listRecruitIdsFromRedis();
    for (const key of recruitKeys) {
      const ttl = await redisClient.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redisClient.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) { await redisClient.del(key); result.deletedRecruitCount += 1; try { const rid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('recruitDeleted', { recruitId: rid, key, timestamp: new Date().toISOString() }); } catch (e) {} }
    }
    const participantKeys = await scanKeys('participants:*');
    for (const key of participantKeys) {
      const ttl = await redisClient.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redisClient.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) { await redisClient.del(key); result.deletedParticipantCount += 1; try { const mid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('participantsDeleted', { messageId: mid, key, timestamp: new Date().toISOString() }); } catch (e) {} }
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

// --- Generic cooldown helpers (per-key TTL based) ---
async function setCooldown(key, ttlSeconds) {
  const redisClient = await ensureRedisConnection();
  const k = `cooldown:${key}`;
  const ttl = Math.max(1, Number(ttlSeconds || 0));
  await redisClient.set(k, '1', 'EX', ttl);
  return { ok: true, key: k, ttl };
}

async function getCooldownRemaining(key) {
  const redisClient = await ensureRedisConnection();
  const k = `cooldown:${key}`;
  const ttl = await redisClient.ttl(k);
  return ttl > 0 ? ttl : 0;
}

async function pushRecruitToWebAPI(recruitData) {
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/push`;
  try {
    const payload = JSON.stringify(recruitData);
    const headers = { 'Content-Type': 'application/json' };
    const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
    if (svc) {
      headers['Authorization'] = `Bearer ${svc}`;
      headers['x-service-token'] = svc; // Worker 側の優先ヘッダー
    }
    else {
      console.warn('[pushRecruitToWebAPI] SERVICE_TOKEN not set in bot environment; backend will likely return 401');
    }
    const resp = await fetch(url, { method: 'POST', headers, body: payload });
    const text = await resp.text().catch(() => '');
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!resp.ok) return { ok: false, status: resp.status, body };
    return { ok: true, status: resp.status, body };
  } catch (err) {
    console.error('pushRecruitToWebAPI error:', err?.message || err);
    return { ok: false, status: null, error: err?.message || String(err) };
  }
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
  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruit-status`, {
      method: 'POST',
      body: JSON.stringify({ serverId, channelId, messageId, startTime })
    });
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function saveRecruitmentData(guildId, channelId, messageId, guildName, channelName, recruitData) {
  const recruitId = recruitData.recruitId || String(messageId).slice(-8);
  const ownerId = recruitData.recruiterId || recruitData.ownerId;
  if (!ownerId) {
    throw new Error('saveRecruitmentData: recruiterId/ownerId is required to persist recruitment');
  }

  const normalizeVoice = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return false;
    const lower = value.toLowerCase();
    return lower.includes('あり') || lower.includes('yes') || lower.includes('true');
  };

  const participantsArray = Array.isArray(recruitData.participantsList)
    ? recruitData.participantsList.filter(Boolean)
    : Array.isArray(recruitData.participants)
      ? recruitData.participants.filter(Boolean)
      : [ownerId];

  if (!participantsArray.includes(ownerId)) {
    participantsArray.unshift(ownerId);
  }

  const payload = {
    recruitId,
    ownerId,
    title: recruitData.title || '',
    description: recruitData.content || recruitData.description || '',
    game: recruitData.game || '',
    platform: recruitData.platform || '',
    startTime: recruitData.startTime || recruitData.start_time || new Date().toISOString(),
    maxMembers: Number.parseInt(recruitData.participants ?? recruitData.maxMembers ?? participantsArray.length, 10) || undefined,
    voice: normalizeVoice(recruitData.vc ?? recruitData.voice),
    participants: participantsArray.slice(0, 100),
    status: (recruitData.status || 'recruiting'),
    metadata: {
      guildId,
      guildName: guildName ?? null,
      channelId,
      channelName: channelName ?? null,
      messageId,
      panelColor: recruitData.panelColor || null,
      vc: recruitData.vc ?? recruitData.voice ?? null,
      note: recruitData.note ?? null,
      startLabel: recruitData.startTime || null,
      raw: recruitData
    }
  };

  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return { ok: true, status: 201, body };
  } catch (error) {
    return {
      ok: false,
      status: error?.status ?? null,
      error: error?.body ?? error?.message ?? String(error)
    };
  }
}

async function deleteRecruitStatus(serverId) {
  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruit-status?serverId=${serverId}`, { method: 'DELETE' });
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function deleteRecruitmentData(messageId, requesterId = null) {
  try {
    const rid = normalizeRecruitId(messageId);
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/${encodeURIComponent(rid)}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: requesterId })
    });
    return { ok: true, status: 200, body: body || null };
  } catch (error) {
    if (error?.status === 404) {
      return { ok: false, status: 404, body: error.body || null, warning: 'Recruitment not found' };
    }
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function updateRecruitmentStatus(messageId, status, endTime = null) {
  const updateData = { status: status, ...(endTime && { end_time: endTime }) };
  const rid = normalizeRecruitId(messageId);
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/${encodeURIComponent(rid)}`;
  try {
    const body = await backendFetch(url, { method: 'PATCH', body: JSON.stringify(updateData) });
    return { ok: true, body };
  } catch (error) {
    if (error?.status === 404) {
      return { ok: false, status: 404, warning: 'Recruitment data not found', messageId };
    }
    throw error;
  }
}

async function updateRecruitmentData(messageId, recruitData) {
  const updateData = { title: recruitData.title || null, content: recruitData.content, participants_count: parseInt(recruitData.participants), start_game_time: recruitData.startTime, vc: recruitData.vc, note: recruitData.note || null };
  const rid = normalizeRecruitId(messageId);
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/${encodeURIComponent(rid)}`;
  try {
    const body = await backendFetch(url, { method: 'PATCH', body: JSON.stringify(updateData) });
    return { ok: true, body };
  } catch (error) {
    if (error?.status === 404) return { ok: false, status: 404, warning: 'Recruitment data not found' };
    throw error;
  }
}

async function getActiveRecruits() {
  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/active-recruits`);
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

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
  getRecruitFromWorker,
  pushRecruitToWebAPI,
  saveGuildSettingsToRedis,
  getGuildSettingsFromRedis,
  finalizeGuildSettings,
  getGuildSettings: getGuildSettingsFromRedis,
  saveParticipantsToRedis,
  getParticipantsFromRedis,
  deleteParticipantsFromRedis,
  setCooldown,
  getCooldownRemaining,
  RECRUIT_TTL_SECONDS,
  cleanupExpiredRecruits,
  dbEvents,
  runCleanupNow,
  getLastCleanupStatus
};
