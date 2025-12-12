// Aggregate exports to keep the original API surface
const { ensureRedisConnection, RECRUIT_TTL_SECONDS, scanKeys } = require('./redis');
const { dbEvents, getLastCleanupStatus } = require('./events');
const { normalizeRecruitId } = require('./utils');
const { normalizeGuildSettingsObject, saveGuildSettingsToRedis, getGuildSettingsFromRedis, getGuildSettingsSmart, finalizeGuildSettings } = require('./guildSettings');
const { saveParticipantsToRedis, getParticipantsFromRedis, deleteParticipantsFromRedis } = require('./participants');
const { saveRecruitToRedis, getRecruitFromRedis, listRecruitIdsFromRedis, listRecruitsFromRedis, deleteRecruitFromRedis, getRecruitFromWorker, pushRecruitToWebAPI } = require('./recruits');
const { cleanupExpiredRecruits, runCleanupNow } = require('./cleanup');
const { setCooldown, getCooldownRemaining } = require('./cooldown');
const { getSupabase } = require('./supabase');
const { saveRecruitStatus, deleteRecruitStatus, getActiveRecruits, saveRecruitmentData, deleteRecruitmentData, updateRecruitmentStatus, updateRecruitmentData } = require('./statusApi');
const { checkAndNotifyStartTime } = require('./startTimeNotifier');
// const { saveFriendCode, getFriendCode, getAllFriendCodes, deleteFriendCode, searchFriendCodeByPattern } = require('./friendCode'); // 使用しない（Worker API経由に移行）

// schedule periodic cleanup — 一時的に無効化（期限廃止）
// const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 1000 * 60 * 60);
// cleanupExpiredRecruits().catch(() => {});
// setInterval(() => { cleanupExpiredRecruits().catch(e => console.warn('periodic cleanup failed:', e?.message || e)); }, CLEANUP_INTERVAL_MS);

// schedule start time notifications check (every minute)
const START_TIME_CHECK_INTERVAL_MS = Number(process.env.START_TIME_CHECK_INTERVAL_MS || 60 * 1000);
let discordClient = null;

function setDiscordClient(client) {
  discordClient = client;
  console.log('[StartTimeNotifier] Discord client registered');
}

setInterval(() => {
  if (discordClient) {
    checkAndNotifyStartTime(discordClient).catch(e => console.warn('start time check failed:', e?.message || e));
  }
}, START_TIME_CHECK_INTERVAL_MS);

module.exports = {
  // Supabase
  getSupabase,
  // Recruit status (Worker API)
  saveRecruitStatus,
  deleteRecruitStatus,
  getActiveRecruits,
  saveRecruitmentData,
  deleteRecruitmentData,
  updateRecruitmentStatus,
  updateRecruitmentData,
  // Recruits cache (Redis)
  saveRecruitToRedis,
  getRecruitFromRedis,
  listRecruitIdsFromRedis,
  listRecruitsFromRedis,
  deleteRecruitFromRedis,
  getRecruitFromWorker,
  pushRecruitToWebAPI,
  // Guild settings (Redis + Worker finalize)
  saveGuildSettingsToRedis,
  getGuildSettingsFromRedis,
  getGuildSettingsSmart,
  finalizeGuildSettings,
  getGuildSettings: getGuildSettingsSmart,
  // Participants
  saveParticipantsToRedis,
  getParticipantsFromRedis,
  deleteParticipantsFromRedis,
  // Cooldowns
  setCooldown,
  getCooldownRemaining,
  // Friend codes - Worker API経由に移行したためコメントアウト
  // saveFriendCode,
  // getFriendCode,
  // getAllFriendCodes,
  // deleteFriendCode,
  // searchFriendCodeByPattern,
  // Consts & maintenance
  RECRUIT_TTL_SECONDS,
  cleanupExpiredRecruits,
  runCleanupNow,
  getLastCleanupStatus,
  // Events
  dbEvents,
  // Utils (internal)
  normalizeRecruitId,
  ensureRedisConnection,
  scanKeys,
  // Start time notifications
  setDiscordClient,
};
