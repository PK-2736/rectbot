const { Queue, QueueEvents } = require('bullmq');
const {
  queueName,
  connectionOptions,
  defaultJobOptions,
  queueTimeoutMs,
  queueStrict,
  queueDisabled
} = require('./imageQueueConfig');

const queue = new Queue(queueName, { connection: connectionOptions });
const queueEvents = new QueueEvents(queueName, { connection: connectionOptions });

queue.on('error', (err) => {
  console.error('[imageQueue] queue error:', err?.message || err);
});

queueEvents.on('error', (err) => {
  console.error('[imageQueue] queueEvents error:', err?.message || err);
});

async function buildAvatarUrlMap(client, participantIds) {
  if (!client || !Array.isArray(participantIds) || participantIds.length === 0) return {};
  const uniqueIds = Array.from(new Set(participantIds)).slice(0, 16);
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    try {
      const user = await client.users.fetch(id);
      const url = user.displayAvatarURL({ extension: 'png', size: 128 });
      return [id, url];
    } catch (_) {
      return [id, null];
    }
  }));
  const map = {};
  for (const [id, url] of entries) {
    if (url) map[id] = url;
  }
  return map;
}

async function waitForJobResult(job) {
  return await job.waitUntilFinished(queueEvents, queueTimeoutMs);
}

async function runWithFallback(label, handler, fallback) {
  try {
    return await handler();
  } catch (err) {
    console.warn(`[imageQueue] ${label} failed:`, err?.message || err);
    if (queueStrict) throw err;
    return await fallback();
  }
}

async function generateRecruitCardQueued(recruitData, participantIds = [], client = null, accentColor = null) {
  if (queueDisabled) {
    if (queueStrict) throw new Error('image queue disabled');
    const { generateRecruitCard } = require('./canvasRecruit');
    return await generateRecruitCard(recruitData, participantIds, client, accentColor);
  }

  const avatarUrls = await buildAvatarUrlMap(client, participantIds);

  return await runWithFallback(
    'recruit-card',
    async () => {
      const job = await queue.add('recruit-card', {
        recruitData,
        participantIds,
        accentColor,
        avatarUrls
      }, defaultJobOptions);

      const result = await waitForJobResult(job);
      if (!result?.imageBase64) throw new Error('imageBase64 missing');
      return Buffer.from(result.imageBase64, 'base64');
    },
    async () => {
      const { generateRecruitCard } = require('./canvasRecruit');
      return await generateRecruitCard(recruitData, participantIds, client, accentColor);
    }
  );
}

async function generateClosedRecruitCardQueued(originalImageBuffer) {
  if (!originalImageBuffer) {
    throw new Error('originalImageBuffer is required');
  }

  if (queueDisabled) {
    if (queueStrict) throw new Error('image queue disabled');
    const { generateClosedRecruitCard } = require('./canvasRecruit');
    return await generateClosedRecruitCard(originalImageBuffer);
  }

  return await runWithFallback(
    'recruit-card-closed',
    async () => {
      const job = await queue.add('recruit-card-closed', {
        originalImageBase64: originalImageBuffer.toString('base64')
      }, defaultJobOptions);

      const result = await waitForJobResult(job);
      if (!result?.imageBase64) throw new Error('imageBase64 missing');
      return Buffer.from(result.imageBase64, 'base64');
    },
    async () => {
      const { generateClosedRecruitCard } = require('./canvasRecruit');
      return await generateClosedRecruitCard(originalImageBuffer);
    }
  );
}

module.exports = {
  generateRecruitCardQueued,
  generateClosedRecruitCardQueued
};
