/**
 * recruit-close-helpers.js
 * 募集締切処理のヘルパー関数
 */

const { _MessageFlags, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { safeReply } = require('../../../utils/safeReply');
const { _createErrorEmbed } = require('../../../utils/embedHelpers');
const { generateRecruitCardQueued, generateClosedRecruitCardQueued } = require('../../../utils/imageQueue');

/**
 * Hex色を整数に変換
 */
function hexToIntColor(hex, fallbackInt) {
  const cleaned = (typeof hex === 'string' && hex.startsWith('#')) ? hex.slice(1) : hex;
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : fallbackInt;
}

/**
 * 募集主の権限を検証
 */
async function validateRecruiterPermission(data, userId, _messageId) {
  if (!data) {
    return { valid: false, error: '募集データが見つかりません。' };
  }
  
  if (data.recruiterId !== userId) {
    return { valid: false, error: '締め切りを実行できるのは募集主のみです。', errorTitle: '権限エラー' };
  }
  
  return { valid: true };
}

/**
 * 元の画像を取得（メッセージアタッチメント）
 */
async function fetchOriginalImage(originalMessage, _messageId) {
  if (!originalMessage?.attachments?.size) return null;
  
  try {
    const url = originalMessage.attachments.first().url;
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  } catch (imgErr) {
    console.warn('[fetchOriginalImage] Failed to fetch:', imgErr?.message || imgErr);
    return null;
  }
}

/**
 * 新規募集画像を生成
 */
async function generateNewClosedImage(recruitData, participants, client, _messageId) {
  try {
    let useColor = recruitData?.panelColor || '808080';
    if (typeof useColor === 'string' && useColor.startsWith('#')) useColor = useColor.slice(1);
    if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) useColor = '808080';
    
    return await generateRecruitCardQueued(recruitData, participants, client, useColor);
  } catch (imgErr) {
    console.warn('[generateNewClosedImage] Failed to generate:', imgErr?.message || imgErr);
    return null;
  }
}

/**
 * 募集画像を締切済みバージョンに変換
 */
async function applyClosedImageFilter(baseImageBuffer) {
  if (!baseImageBuffer) return null;
  
  try {
    return await generateClosedRecruitCardQueued(baseImageBuffer);
  } catch (imgErr) {
    console.warn('[applyClosedImageFilter] Failed to apply filter:', imgErr?.message || imgErr);
    return null;
  }
}

/**
 * 締切画像となるAttachmentを取得
 */
async function getClosedImageAttachment(recruitData, participants, client, originalMessage, messageId) {
  let baseImageBuffer = await fetchOriginalImage(originalMessage);
  
  if (!baseImageBuffer) {
    baseImageBuffer = await generateNewClosedImage(recruitData, participants, client, messageId);
  }
  
  if (!baseImageBuffer) return null;
  
  const closedImageBuffer = await applyClosedImageFilter(baseImageBuffer);
  if (!closedImageBuffer) return null;
  
  return new AttachmentBuilder(closedImageBuffer, { name: 'recruit-card-closed.png' });
}

/**
 * 募集主への締切通知を送信
 */
async function notifyRecruiterOfClose(interaction, recruitData, finalParticipants, _messageId) {
  if (!recruitData?.recruiterId) return;
  
  try {
    const closeColor = hexToIntColor(recruitData?.panelColor || '808080', 0x808080);
    const closeEmbed = new EmbedBuilder()
      .setColor(closeColor)
      .setTitle('🔒 募集締切')
      .setDescription(`**${recruitData.title}** の募集を締め切りました。`)
      .addFields({
        name: '最終参加者数',
        value: `${finalParticipants.length}/${recruitData.participants}人`,
        inline: false
      });
    
    await safeReply(interaction, {
      content: `<@${recruitData.recruiterId}>`,
      embeds: [closeEmbed],
      allowedMentions: { users: [recruitData.recruiterId] }
    });
  } catch (e) {
    console.warn('safeReply failed during close:', e?.message || e);
  }
}

/**
 * 専用チャンネルを非同期で削除
 */
function deleteDedicatedChannelAsync(interaction, recruitData, delayMs) {
  (async () => {
    try {
      const { getDedicatedChannel, deleteDedicatedChannel } = require('../../../utils/db/dedicatedChannels');
      const recruitId = recruitData?.recruitId || String(interaction.message?.id).slice(-8);
      const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);

      if (!dedicatedChannelId) return;

      // 削除予定通知
      try {
        const channel = await interaction.guild.channels.fetch(dedicatedChannelId).catch(() => null);
        if (channel?.send) {
          await channel.send({
            content: `⏰ **募集が締められたので${delayMs / 60000}分後に専用チャンネルを削除します**`,
            allowedMentions: { roles: [], users: [] }
          });
        }
      } catch (e) {
        console.warn('[deleteDedicatedChannelAsync] Failed to send notice:', e?.message || e);
      }

      // 遅延後に削除
      setTimeout(async () => {
        try {
          const channel = await interaction.guild.channels.fetch(dedicatedChannelId).catch(() => null);
          if (channel) await channel.delete();
          await deleteDedicatedChannel(recruitId);
        } catch (e) {
          console.warn(`[deleteDedicatedChannelAsync] Failed to delete:`, e?.message || e);
        }
      }, delayMs);
    } catch (e) {
      console.warn('[deleteDedicatedChannelAsync] Error:', e?.message || e);
    }
  })();
}

module.exports = {
  validateRecruiterPermission,
  fetchOriginalImage,
  generateNewClosedImage,
  applyClosedImageFilter,
  getClosedImageAttachment,
  notifyRecruiterOfClose,
  deleteDedicatedChannelAsync
};
