const siteId = process.env.SITE_ID || 'default';
const rawQueueName = process.env.IMAGE_QUEUE_NAME || `rectbot-image-${siteId}`;
const queueName = String(rawQueueName).replace(/:/g, '-');

const connectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB || 0),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null,
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
const queueDirectFirst = String(process.env.IMAGE_QUEUE_DIRECT_FIRST || 'true').toLowerCase() === 'true';
const queueParallelThreshold = Number(process.env.IMAGE_QUEUE_PARALLEL_THRESHOLD || 2);

module.exports = {
  queueName,
  connectionOptions,
  defaultJobOptions,
  queueTimeoutMs,
  queueStrict,
  queueDisabled,
  queueDirectFirst,
  queueParallelThreshold
};
