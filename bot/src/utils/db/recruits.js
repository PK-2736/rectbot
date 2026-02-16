const config = require('../../config');
const backendFetch = require('../backendFetch');
const { ensureRedisConnection, RECRUIT_TTL_SECONDS, scanKeys } = require('./redis');
const { getParticipantsFromRedis } = require('./participants');
const { normalizeRecruitId } = require('./utils');

async function saveRecruitToRedis(recruitId, data) {
  const redis = await ensureRedisConnection();
  // TTLを3日(259200秒)に設定
  const ttlSeconds = Number(RECRUIT_TTL_SECONDS || 259200);
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.set(`recruit:${recruitId}`, JSON.stringify(data), 'EX', ttlSeconds);
  } else {
    await redis.set(`recruit:${recruitId}`, JSON.stringify(data));
  }
}

async function getRecruitFromRedis(recruitId) {
  const redis = await ensureRedisConnection();
  const val = await redis.get(`recruit:${recruitId}`);
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

async function listRecruitIdsFromRedis() {
  return await scanKeys('recruit:*');
}

async function listRecruitsFromRedis() {
  const keys = await listRecruitIdsFromRedis();
  if (keys.length === 0) return [];
  const redis = await ensureRedisConnection();
  const vals = await redis.mget(keys);
  const recruits = vals.map(v => v ? JSON.parse(v) : null).filter(Boolean);
  for (const recruit of recruits) {
    if (recruit.messageId) {
      try {
        const participants = await getParticipantsFromRedis(recruit.messageId);
        recruit.participantsList = participants;
        recruit.currentParticipants = participants.length;
      } catch (_) {
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
  const redis = await ensureRedisConnection();
  await redis.del(`recruit:${recruitId}`);
}

async function pushRecruitToWebAPI(recruitData) {
  try {
    const payload = JSON.stringify(recruitData);
    const body = await backendFetch('/api/recruitments', { method: 'POST', body: payload });
    return { ok: true, status: 200, body };
  } catch (err) {
    console.error('pushRecruitToWebAPI error:', err?.message || err);
    return { ok: false, status: null, error: err?.message || String(err) };
  }
}

module.exports = {
  saveRecruitToRedis,
  getRecruitFromRedis,
  listRecruitIdsFromRedis,
  listRecruitsFromRedis,
  deleteRecruitFromRedis,
  getRecruitFromWorker,
  pushRecruitToWebAPI,
};
