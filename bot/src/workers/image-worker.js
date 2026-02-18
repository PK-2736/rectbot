require('dotenv').config();

const { Worker } = require('bullmq');
const { queueName, connectionOptions } = require('../utils/imageQueueConfig');
const { generateRecruitCard, generateClosedRecruitCard } = require('../utils/canvasRecruit');

const worker = new Worker(
  queueName,
  async (job) => {
    if (job.name === 'recruit-card') {
      const { recruitData, participantIds, accentColor, avatarUrls } = job.data || {};
      const buffer = await generateRecruitCard(recruitData, participantIds, null, accentColor, avatarUrls);
      return { imageBase64: buffer.toString('base64') };
    }

    if (job.name === 'recruit-card-closed') {
      const { originalImageBase64 } = job.data || {};
      if (!originalImageBase64) throw new Error('originalImageBase64 missing');
      const buffer = await generateClosedRecruitCard(Buffer.from(originalImageBase64, 'base64'));
      return { imageBase64: buffer.toString('base64') };
    }

    throw new Error(`Unknown job type: ${job.name}`);
  },
  { connection: connectionOptions, concurrency: 1 }
);

worker.on('failed', (job, err) => {
  console.error('[image-worker] job failed:', job?.id, job?.name, err?.message || err);
});

worker.on('error', (err) => {
  console.error('[image-worker] worker error:', err?.message || err);
});
