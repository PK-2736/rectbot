/**
 * participant-join-helpers.js
 * 参加・キャンセル処理の通知ロジック
 */

const { _MessageFlags, EmbedBuilder } = require('discord.js');
const { _safeReply } = require('../../../utils/safeReply');

/**
 * Hex色を整数に変換
 */
function hexToIntColor(hex, fallbackInt) {
  const cleaned = (typeof hex === 'string' && hex.startsWith('#')) ? hex.slice(1) : hex;
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : fallbackInt;
}

/**
 * 参加者が既に参加済みかチェック
 */
function validateJoinParticipant(participants, userId) {
  return !participants.includes(userId);
}

/**
 * 参加者をキャッシュ＆Redisに追加
 */
async function addParticipantToCache(messageId, participants, userId, saveToRedis) {
  if (!participants.includes(userId)) {
    participants.push(userId);
  }
  
  if (saveToRedis) {
    try {
      await saveToRedis(messageId, participants);
    } catch (e) {
      console.warn('参加者保存失敗:', e?.message || e);
    }
  }
}

/**
 * 参加者をキャッシュ＆Redisから削除
 */
async function removeParticipantFromCache(messageId, participants, userId, saveToRedis) {
  const updated = participants.filter(id => id !== userId);
  
  if (saveToRedis && participants.length > updated.length) {
    try {
      await saveToRedis(messageId, updated);
    } catch (e) {
      console.warn('参加者保存失敗:', e?.message || e);
    }
  }
  
  return updated;
}

/**
 * チャンネルに参加/キャンセル通知を送信
 */
async function notifyChannelOfParticipantChange(interaction, savedRecruitData, action, dedicatedChannelId) {
  if (!savedRecruitData?.channelId) return;
  
  (async () => {
    try {
      const channel = await interaction.client.channels.fetch(savedRecruitData.channelId).catch(() => null);
      if (!channel?.isTextBased()) return;
      
      let notificationContent;
      if (action === 'join') {
        notificationContent = `🎉 <@${interaction.user.id}> が参加しました！`;
        if (dedicatedChannelId) {
          notificationContent += `\n🔗 専用チャンネル: <#${dedicatedChannelId}>`;
        }
      } else if (action === 'cancel') {
        notificationContent = `📤 <@${interaction.user.id}> が離脱しました。`;
      }
      
      const notificationMsg = await channel.send({
        content: notificationContent,
        allowedMentions: { users: [] }
      });
      
      // 5分後に削除
      setTimeout(() => {
        notificationMsg.delete().catch(() => {});
      }, 5 * 60 * 1000);
    } catch (e) {
      console.warn(`notification message (${action}) failed:`, e?.message || e);
    }
  })();
}

/**
 * 募集主へ参加/キャンセル通知DM送信
 */
async function notifyRecruiterOfParticipantChange(interaction, data, action, participantCount) {
  if (!data?.recruiterId) return;
  
  (async () => {
    try {
      const embedColor = action === 'join'
        ? hexToIntColor(data?.panelColor || '00FF00', 0x00FF00)
        : hexToIntColor(data?.panelColor || 'FF6B35', 0xFF6B35);
      
      const embedTitle = action === 'join'
        ? '🎮 新しい参加者がいます！'
        : '📤 参加者がキャンセルしました';
      
      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(embedTitle)
        .setDescription(
          action === 'join'
            ? `<@${interaction.user.id}> が募集に参加しました！`
            : `<@${interaction.user.id}> が募集から離脱しました。`
        )
        .addFields(
          { name: '募集タイトル', value: data.title || 'なし', inline: false },
          { name: '現在の参加者数', value: `${participantCount}/${data.participants}人`, inline: true }
        )
        .setTimestamp();
      
      const recruiterUser = await interaction.client.users.fetch(data.recruiterId).catch(() => null);
      if (recruiterUser?.send) {
        const dmContent = action === 'join'
          ? `あなたの募集に参加者が増えました: ${data.title || ''}`
          : `あなたの募集から参加者が離脱しました: ${data.title || ''}`;
        
        await recruiterUser.send({
          content: dmContent,
          embeds: [embed]
        }).catch(() => null);
      }
    } catch (e) {
      console.warn(`background recruiter notify (${action}) failed:`, e?.message || e);
    }
  })();
}

module.exports = {
  validateJoinParticipant,
  addParticipantToCache,
  removeParticipantFromCache,
  notifyChannelOfParticipantChange,
  notifyRecruiterOfParticipantChange
};
