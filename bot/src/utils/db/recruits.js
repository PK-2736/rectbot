const config = require('../../config');
const backendFetch = require('../backendFetch');
const { ensureRedisConnection, RECRUIT_TTL_SECONDS, scanKeys } = require('./redis');
const { getParticipantsFromRedis } = require('./participants');
const { normalizeRecruitId } = require('./utils');

async function saveRecruitToRedis(recruitId, data) {
  const redis = await ensureRedisConnection();
  await redis.set(`recruit:${recruitId}`, JSON.stringify(data), 'EX', RECRUIT_TTL_SECONDS);
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
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/push`;
  try {
    const payload = JSON.stringify(recruitData);
    const headers = { 'Content-Type': 'application/json' };
    const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
    if (svc) {
      headers['Authorization'] = `Bearer ${svc}`;
      headers['x-service-token'] = svc;
    } else {
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

module.exports = {
  saveRecruitToRedis,
  getRecruitFromRedis,
  listRecruitIdsFromRedis,
  listRecruitsFromRedis,
  deleteRecruitFromRedis,
  getRecruitFromWorker,
  pushRecruitToWebAPI,
};
