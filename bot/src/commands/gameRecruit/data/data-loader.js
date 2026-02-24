/**
 * データロード・ハイドレーションモジュール
 * 参加者データ、募集データ、ボイスチャンネル名、アバター等の読み込み
 */

const { recruitParticipants } = require('../data/state');
const { getParticipantsFromRedis, getRecruitFromRedis, listRecruitsFromRedis } = require('../../utils/db');

/**
 * 参加者リストをRedisから復元（ハイドレーション）
 */
async function hydrateParticipants(interaction, messageId) {
  let participants = recruitParticipants.get(messageId) || [];
  try {
    const persisted = await getParticipantsFromRedis(messageId);
    if (Array.isArray(persisted) && persisted.length > 0) {
      if (!participants || participants.length === 0) {
        participants = persisted;
        recruitParticipants.set(messageId, participants);
      }
    }
  } catch (e) {
    console.warn('参加者リスト復元に失敗:', e?.message || e);
  }
  return participants;
}

/**
 * 保存済み募集データをRedisから読み込み
 */
async function loadSavedRecruitData(interaction, messageId) {
  let savedRecruitData = null;
  try {
    const recruitId = String(messageId).slice(-8);
    savedRecruitData = await getRecruitFromRedis(recruitId);
    if (!savedRecruitData) {
      try {
        const all = await listRecruitsFromRedis();
        savedRecruitData = all.find(r => r && (r.message_id === messageId || r.messageId === messageId || r.recruitId === recruitId));
      } catch (e) {
        console.warn('listRecruitsFromRedis fallback failed:', e?.message || e);
      }
    }
  } catch (e) {
    console.warn('getRecruitFromRedis failed:', e?.message || e);
    savedRecruitData = null;
  }
  return savedRecruitData;
}

/**
 * ボイスチャンネル名を取得
 */
async function fetchVoiceChannelName(guild, voiceChannelId) {
  if (!voiceChannelId) return null;
  try {
    const voiceChannel = await guild.channels.fetch(voiceChannelId);
    return voiceChannel?.name || null;
  } catch (e) {
    console.warn('Failed to fetch voice channel:', e?.message || e);
    return null;
  }
}

/**
 * ユーザーアバターURLを取得
 */
async function fetchUserAvatarUrl(interaction) {
  try {
    const fetched = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
    if (fetched?.displayAvatarURL) {
      return fetched.displayAvatarURL({ size: 128, extension: 'png' });
    }
  } catch (_) {}
  return null;
}

/**
 * 最終的なRecruitDataオブジェクトを作成
 */
function createFinalRecruitData(actualRecruitId, actualMessageId, recruitDataObj, interaction) {
  return {
    ...recruitDataObj,
    recruitId: actualRecruitId,
    ownerId: recruitDataObj.recruiterId || interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    message_id: actualMessageId,
    status: 'recruiting',
    start_time: new Date().toISOString(),
    startTimeNotified: false
  };
}

module.exports = {
  hydrateParticipants,
  loadSavedRecruitData,
  fetchVoiceChannelName,
  fetchUserAvatarUrl,
  createFinalRecruitData
};
