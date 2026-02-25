const db = require('../database');

/**
 * 募集データを正規化・ハイドレーション
 * metadataフィールドからメインフィールドにデータを移す
 * @param {Object} recruit - 募集オブジェクト
 * @returns {Object} ハイドレーション後の募集オブジェクト
 */
function hydrateRecruitData(recruit) {
  if (!recruit || typeof recruit !== 'object') return recruit;
  try {
    _migrateGuildData(recruit);
    _migrateUserData(recruit);
    _migratePanelData(recruit);
    _migrateVoiceData(recruit);
    _migrateTitleData(recruit);
    _migrateParticipantsData(recruit);
  } catch (e) {
    console.warn('hydrateRecruitData failed:', e?.message || e);
  }
  return recruit;
}

/**
 * ギルド関連データの移行
 */
function _migrateGuildData(recruit) {
  if (!recruit.guildId && recruit.metadata?.guildId) {
    recruit.guildId = recruit.metadata.guildId;
  }
  if (!recruit.channelId && recruit.metadata?.channelId) {
    recruit.channelId = recruit.metadata.channelId;
  }
}

/**
 * ユーザー関連データの移行
 */
function _migrateUserData(recruit) {
  if (!recruit.message_id && recruit.metadata?.messageId) {
    recruit.message_id = recruit.metadata.messageId;
  }
  if (!recruit.messageId && recruit.metadata?.messageId) {
    recruit.messageId = recruit.metadata.messageId;
  }
  if (!recruit.recruiterId && recruit.ownerId) {
    recruit.recruiterId = recruit.ownerId;
  }
  if (!recruit.ownerId && recruit.recruiterId) {
    recruit.ownerId = recruit.recruiterId;
  }
}

/**
 * パネルカラー移行
 */
function _migratePanelData(recruit) {
  if (!recruit.panelColor && recruit.metadata?.panelColor) {
    recruit.panelColor = recruit.metadata.panelColor;
  }
}

/**
 * 音声関連データの移行
 */
function _migrateVoiceData(recruit) {
  if (!recruit.vc && recruit.metadata?.vc) {
    recruit.vc = recruit.metadata.vc;
  }
  if (!recruit.note && recruit.metadata?.note) {
    recruit.note = recruit.metadata.note;
  }
  if (!recruit.content && recruit.metadata?.raw?.content) {
    recruit.content = recruit.metadata.raw.content;
  }
}

/**
 * タイトル関連データの移行
 */
function _migrateTitleData(recruit) {
  if (!recruit.title) {
    recruit.title = recruit.metadata?.raw?.title || recruit.metadata?.title || recruit.description || '募集';
  }
}

/**
 * 参加者データの移行
 */
function _migrateParticipantsData(recruit) {
  if (!recruit.participants && Array.isArray(recruit.metadata?.raw?.participants)) {
    recruit.participants = recruit.metadata.raw.participants;
  }
}

/**
 * 募集データを取得（Redis -> Worker）
 * @param {string} recruitId - 募集ID
 * @returns {Promise<Object|null>} 募集データまたはnull
 */
async function fetchRecruitData(recruitId) {
  try {
    let data = await db.getRecruitFromRedis(recruitId);
    if (data) return data;

    const workerRes = await db.getRecruitFromWorker(recruitId);
    if (workerRes?.ok && workerRes.body) {
      data = workerRes.body;
      try {
        await db.saveRecruitToRedis(recruitId, data);
      } catch (_) {}
      return data;
    }
  } catch (e) {
    console.warn('fetchRecruitData failed:', e?.message || e);
  }
  return null;
}

module.exports = {
  hydrateRecruitData,
  fetchRecruitData
};
