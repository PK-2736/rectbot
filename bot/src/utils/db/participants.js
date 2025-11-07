const { ensureRedisConnection, RECRUIT_TTL_SECONDS } = require('./redis');

async function saveParticipantsToRedis(messageId, participants) {
  const redis = await ensureRedisConnection();
  await redis.set(`participants:${messageId}`, JSON.stringify(participants), 'EX', RECRUIT_TTL_SECONDS);
}

async function getParticipantsFromRedis(messageId) {
  const redis = await ensureRedisConnection();
  const val = await redis.get(`participants:${messageId}`);
  return val ? JSON.parse(val) : [];
}

async function deleteParticipantsFromRedis(messageId) {
  const redis = await ensureRedisConnection();
  await redis.del(`participants:${messageId}`);
}

module.exports = {
  saveParticipantsToRedis,
  getParticipantsFromRedis,
  deleteParticipantsFromRedis,
};
