const siteId = process.env.SITE_ID || 'default';
const queueName = process.env.IMAGE_QUEUE_NAME || `rectbot:image:${siteId}`;

const connectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB || 0),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
};

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: 50,
  attempts: 2,
  backoff: { type: 'fixed', delay: 1000 }
};

const queueTimeoutMs = Number(process.env.IMAGE_QUEUE_TIMEOUT_MS || 45000);
const queueStrict = String(process.env.IMAGE_QUEUE_STRICT || 'false').toLowerCase() === 'true';
const queueDisabled = String(process.env.IMAGE_QUEUE_DISABLED || 'false').toLowerCase() === 'true';

module.exports = {
  queueName,
  connectionOptions,
  defaultJobOptions,
  queueTimeoutMs,
  queueStrict,
  queueDisabled
};
