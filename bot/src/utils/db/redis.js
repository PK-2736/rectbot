const Redis = require('ioredis');
const EventEmitter = require('events');

let redis;
try {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
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

// TTLは一時的に無効化するため、環境変数未設定時は0（無期限扱い）
const RECRUIT_TTL_SECONDS = Number(process.env.REDIS_RECRUIT_TTL_SECONDS || 0);

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

async function scanKeys(pattern) {
  const client = await ensureRedisConnection();
  const stream = client.scanStream({ match: pattern, count: 100 });
  const keys = [];
  return await new Promise((resolve, reject) => {
    stream.on('data', (resultKeys) => {
      for (const k of resultKeys) keys.push(k);
    });
    stream.on('end', () => resolve(keys));
    stream.on('error', (err) => reject(err));
  });
}

module.exports = {
  ensureRedisConnection,
  RECRUIT_TTL_SECONDS,
  scanKeys,
};
