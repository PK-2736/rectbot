const { ensureRedisConnection, RECRUIT_TTL_SECONDS, scanKeys } = require('./redis');
const { dbEvents, setLastCleanupStatus } = require('./events');

async function cleanupExpiredRecruits() {
  const result = { deletedRecruitCount: 0, deletedParticipantCount: 0, timestamp: new Date().toISOString(), error: null };
  try {
    const redis = await ensureRedisConnection();
    const recruitKeys = await scanKeys('recruit:*');
    for (const key of recruitKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redis.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) {
        await redis.del(key);
        result.deletedRecruitCount += 1;
        try {
          const rid = key.includes(':') ? key.split(':')[1] : key;
          dbEvents.emit('recruitDeleted', { recruitId: rid, key, timestamp: new Date().toISOString() });
        } catch (_) {}
      }
    }
    const participantKeys = await scanKeys('participants:*');
    for (const key of participantKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redis.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) {
        await redis.del(key);
        result.deletedParticipantCount += 1;
        try {
          dbEvents.emit('participantsDeleted', { key, timestamp: new Date().toISOString() });
        } catch (_) {}
      }
    }
    setLastCleanupStatus({ lastRun: result.timestamp, deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: null });
    return result;
  } catch (e) {
    setLastCleanupStatus({ lastRun: new Date().toISOString(), deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: e?.message || String(e) });
    return { ...result, error: e?.message || String(e) };
  }
}

async function runCleanupNow() { return cleanupExpiredRecruits(); }

module.exports = { cleanupExpiredRecruits, runCleanupNow };
