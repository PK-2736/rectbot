const { ensureRedisConnection } = require('./redis');

async function setCooldown(key, ttlSeconds) {
  const redis = await ensureRedisConnection();
  const k = `cooldown:${key}`;
  const ttl = Math.max(1, Number(ttlSeconds || 0));
  await redis.set(k, '1', 'EX', ttl);
  return { ok: true, key: k, ttl };
}

async function getCooldownRemaining(key) {
  const redis = await ensureRedisConnection();
  const k = `cooldown:${key}`;
  const ttl = await redis.ttl(k);
  return ttl > 0 ? ttl : 0;
}

module.exports = { setCooldown, getCooldownRemaining };
