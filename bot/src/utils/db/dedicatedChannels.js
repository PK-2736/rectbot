const { ensureRedisConnection } = require('./redis');

/**
 * 募集に紐付いた専用チャンネルIDを保存
 * @param {string} recruitId - 募集ID
 * @param {string} channelId - 専用チャンネルID
 * @param {number} ttlSeconds - TTL（秒）
 */
async function saveDedicatedChannel(recruitId, channelId, ttlSeconds = 86400) {
  const redis = await ensureRedisConnection();
  const key = `dedicated_channel:${recruitId}`;
  
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.set(key, channelId, 'EX', ttlSeconds);
  } else {
    await redis.set(key, channelId);
  }
  
  console.log(`[dedicatedChannels] Saved channel ${channelId} for recruit ${recruitId}`);
}

/**
 * 募集に紐付いた専用チャンネルIDを取得
 * @param {string} recruitId - 募集ID
 */
async function getDedicatedChannel(recruitId) {
  const redis = await ensureRedisConnection();
  const key = `dedicated_channel:${recruitId}`;
  return await redis.get(key);
}

/**
 * 募集に紐付いた専用チャンネルIDを削除
 * @param {string} recruitId - 募集ID
 */
async function deleteDedicatedChannel(recruitId) {
  const redis = await ensureRedisConnection();
  const key = `dedicated_channel:${recruitId}`;
  await redis.del(key);
  console.log(`[dedicatedChannels] Deleted channel reference for recruit ${recruitId}`);
}

/**
 * 参加者のメッセージIDリストを保存（5分TTL）
 * @param {string} recruitId - 募集ID
 * @param {string} messageId - メッセージID
 */
async function saveJoinNotificationMessage(recruitId, messageId) {
  const redis = await ensureRedisConnection();
  const key = `join_notification:${recruitId}`;
  // 5分（300秒）のTTL
  await redis.set(key, messageId, 'EX', 300);
}

/**
 * 参加者メッセージを取得
 * @param {string} recruitId - 募集ID
 */
async function getJoinNotificationMessage(recruitId) {
  const redis = await ensureRedisConnection();
  const key = `join_notification:${recruitId}`;
  return await redis.get(key);
}

module.exports = {
  saveDedicatedChannel,
  getDedicatedChannel,
  deleteDedicatedChannel,
  saveJoinNotificationMessage,
  getJoinNotificationMessage,
};
