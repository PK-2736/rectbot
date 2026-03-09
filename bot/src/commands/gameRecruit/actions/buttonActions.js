/**
 * buttonActions.js - Simplified
 * Handles button click actions: join, cancel, close for recruitment messages
 * Delegates to helper modules for complex logic
 */

const { MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { recruitParticipants } = require('../data/state');
const { safeReply } = require('../../../utils/safeReply');
const { createErrorEmbed } = require('../../../utils/embedHelpers');
const { 
  updateRecruitmentStatus, 
  deleteRecruitmentData, 
  saveRecruitmentData,
  saveParticipantsToRedis, 
  deleteParticipantsFromRedis, 
  getRecruitFromRedis,
  deleteRecruitFromRedis 
} = require('../../../utils/database');
const { updateParticipantList } = require('../../../utils/recruitMessage');

// Helper modules
const { 
  validateJoinParticipant,
  addParticipantToCache,
  removeParticipantFromCache,
  notifyChannelOfParticipantChange,
  notifyRecruiterOfParticipantChange
} = require('../utils/participant-join-helpers');

const {
  validateRecruiterPermission,
  getClosedImageAttachment,
  notifyRecruiterOfClose,
  deleteDedicatedChannelAsync
} = require('../utils/recruit-close-helpers');

const {
  buildVoiceLabel,
  buildRecruitDetailsLine,
  buildFinalParticipantText,
  _buildClosedRecruitText
} = require('../utils/ui-text-helpers');

// Utility: Convert hex color to integer
function hexToIntColor(hex, fallbackInt) {
  const cleaned = (typeof hex === 'string' && hex.startsWith('#')) ? hex.slice(1) : hex;
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : fallbackInt;
}

async function deferCloseInteraction(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch (e) {
    console.warn('[processClose] deferUpdate failed:', e?.message || e);
  }
}

/**
 * Process user joining a recruitment
 */
async function processJoin(interaction, messageId, participants, savedRecruitData) {
  if (!validateJoinParticipant(participants, interaction.user.id)) {
    await safeReply(interaction, { 
      embeds: [createErrorEmbed('既に参加済みです。')], 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
    return;
  }

  // Add to cache and Redis
  recruitParticipants.set(messageId, participants);
  await addParticipantToCache(messageId, participants, interaction.user.id, saveParticipantsToRedis);

  // Send quick reply
  try {
    await safeReply(interaction, { 
      content: '✅ 参加しました！', 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
  } catch (e) {
    console.warn('quick reply failed:', e?.message || e);
  }

  // Get dedicated channel ID for notification
  let dedicatedChannelId = null;
  if (savedRecruitData?.recruitId) {
    try {
      const { getDedicatedChannel } = require('../../../utils/database/db/dedicatedChannels');
      dedicatedChannelId = await getDedicatedChannel(savedRecruitData.recruitId).catch(() => null);
    } catch (e) {
      console.warn('getDedicatedChannel failed:', e?.message || e);
    }
  }

  // Send notifications (channel + recruiter DM)
  notifyChannelOfParticipantChange(interaction, savedRecruitData, 'join', dedicatedChannelId);
  notifyRecruiterOfParticipantChange(interaction, savedRecruitData, 'join', participants.length);

  // Update participant list in message
  updateParticipantList(interaction, participants, savedRecruitData).catch(e => 
    console.warn('updateParticipantList failed (async):', e?.message || e)
  );
}

/**
 * Process user canceling their participation
 */
async function processCancel(interaction, messageId, participants, savedRecruitData) {
  // Prevent recruiter from canceling
  if (savedRecruitData?.recruiterId === interaction.user.id) {
    await safeReply(interaction, { 
      embeds: [createErrorEmbed('募集主は参加をキャンセルできません。\n募集を締める場合は「締め」ボタンを使用してください。')], 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
    return;
  }

  const beforeLength = participants.length;
  const updated = await removeParticipantFromCache(messageId, participants, interaction.user.id, saveParticipantsToRedis);

  if (beforeLength <= updated.length) {
    await safeReply(interaction, { 
      embeds: [createErrorEmbed('参加していないため、取り消せません。')], 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
    return;
  }

  // Update cache
  recruitParticipants.set(messageId, updated);

  // Send quick reply
  try {
    await safeReply(interaction, { 
      content: '✅ 参加を取り消しました。', 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
  } catch (e) {
    console.warn('quick cancel reply failed:', e?.message || e);
  }

  // Send notifications (channel considered, recruiter DM)
  notifyChannelOfParticipantChange(interaction, savedRecruitData, 'cancel', null);
  notifyRecruiterOfParticipantChange(interaction, savedRecruitData, 'cancel', updated.length);

  // Update participant list in message
  updateParticipantList(interaction, updated, savedRecruitData).catch(e => 
    console.warn('updateParticipantList failed (async):', e?.message || e)
  );
}

/**
 * Process recruitment closure
 */
async function processClose(interaction, messageId, savedRecruitData) {
  try {
    // まずインタラクションを即時ACKして「応答なし」を防ぐ
    await deferCloseInteraction(interaction);

    // Validate recruiter permission
    const validation = await validateRecruiterPermission(savedRecruitData, interaction.user.id, messageId);
    if (!validation.valid) {
      await safeReply(interaction, { 
        embeds: [createErrorEmbed(validation.error, validation.errorTitle)], 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Get recruit data
    let data = savedRecruitData;
    if (!data) {
      try {
        data = await getRecruitFromRedis(String(messageId).slice(-8));
      } catch (e) {
        console.warn('close: getRecruitFromRedis failed:', e?.message || e);
      }
    }
    if (!data) {
      await safeReply(interaction, { 
        embeds: [createErrorEmbed('募集データが見つかりません。')], 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Update status and get final participants
    await updateRecruitmentStatusAndDelete(messageId, data.recruiterId, data, interaction);
    const finalParticipants = recruitParticipants.get(messageId) || [];

    // シンプル募集は画像締めにしない（元メッセージに画像がある場合のみ画像締め）
    const hasOriginalImage = !!interaction.message?.attachments?.size;
    const closedAttachment = hasOriginalImage
      ? await getClosedImageAttachment(data, finalParticipants, interaction.client, interaction.message, messageId)
      : null;
    const disabledContainer = (hasOriginalImage && closedAttachment)
      ? buildClosedContainerWithImage(closedAttachment, messageId, finalParticipants, data)
      : buildClosedContainerWithoutImage(messageId, data, interaction.message);

    // Edit message
    const editPayload = {
      components: [disabledContainer],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { roles: [], users: [] }
    };
    if (closedAttachment) {
      editPayload.files = [closedAttachment];
    }
    await interaction.message.edit(editPayload);

    // Notify recruiter
    notifyRecruiterOfClose(interaction, data, finalParticipants, messageId);

    // Cleanup participants and Redis
    recruitParticipants.delete(messageId);
    deleteParticipantsFromRedis(messageId).catch(e => console.warn('Redis参加者削除失敗:', e?.message || e));
    deleteRecruitFromRedis(data.recruitId || String(messageId).slice(-8)).catch(e => 
      console.warn('Redis recruit削除失敗:', e?.message || e)
    );

    // Delete dedicated channel after 5 minutes
    deleteDedicatedChannelAsync(interaction, data, 5 * 60 * 1000);
  } catch (e) {
    console.error('close button handler error:', e);
  }
}

/**
 * Update recruitment status and delete data
 */
async function updateRecruitmentStatusAndDelete(messageId, recruiterId, recruitData = null, interaction = null) {
  let statusUpdateSuccess = false;
  
  try {
    let statusResult = await updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());

    // 404 の場合は、バックエンド未保存レコードを作成してから再試行
    if (!statusResult?.ok && statusResult?.status === 404 && recruitData && interaction) {
      try {
        const seedData = {
          ...recruitData,
          recruitId: recruitData.recruitId || String(messageId).slice(-8),
          ownerId: recruitData.ownerId || recruitData.recruiterId,
          recruiterId: recruitData.recruiterId || recruitData.ownerId,
          message_id: messageId,
          status: recruitData.status || 'recruiting'
        };

        const seedResult = await saveRecruitmentData(
          interaction.guildId,
          interaction.channelId,
          messageId,
          interaction.guild?.name,
          interaction.channel?.name,
          seedData
        );

        if (seedResult?.ok) {
          statusResult = await updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
        }
      } catch (seedErr) {
        console.warn('管理ページの募集データ自己修復に失敗:', seedErr?.message || seedErr);
      }
    }

    statusUpdateSuccess = statusResult?.ok;
    if (!statusUpdateSuccess) {
      console.warn('管理ページの募集ステータス更新が警告:', statusResult);
    }
  } catch (error) {
    console.error('管理ページの募集ステータス更新に失敗:', error);
  }

  if (statusUpdateSuccess) {
    try {
      const delRes = await deleteRecruitmentData(messageId, recruiterId);
      if (!delRes?.ok && delRes?.status !== 404) {
        console.warn('管理API: 募集データ削除の結果が不正です:', delRes);
      }
    } catch (err) {
      console.error('募集データの削除に失敗:', err);
    }
  }
}

/**
 * Build closed container with image
 */
function buildClosedContainerWithImage(closedAttachment, messageId, finalParticipants, recruitData) {
  const container = new ContainerBuilder().setAccentColor(0x808080);

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://recruit-card-closed.png'))
  );
  
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  
  // Use helper function
  const finalParticipantText = buildFinalParticipantText(messageId, recruitData, finalParticipants);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(finalParticipantText));
  
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  
  const recruitIdText = `募集ID: \`${String(messageId).slice(-8)}\` | powered by **Recrubo**`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(recruitIdText));
  
  return container;
}

/**
 * Build closed container without image
 */
function buildClosedContainerWithoutImage(messageId, recruitData, originalMessage) {
  const container = new ContainerBuilder().setAccentColor(0x808080);
  const hasAttachment = !!originalMessage?.attachments?.size;

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('🎮✨ **募集締め切り済み** ✨🎮'));
  
  if (recruitData?.title) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`📌 タイトル\n${String(recruitData.title).slice(0, 200)}`)
    );
  }
  
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  if (hasAttachment) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(originalMessage.attachments.first().url))
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }

  // Details (use helper)
  const detailsLine = buildRecruitDetailsLine(recruitData);
  if (detailsLine) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailsLine));
  }

  // Content
  if (recruitData?.content?.trim()) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`📝 募集内容\n${String(recruitData.content).slice(0, 1500)}`)
    );
  }

  // Participants list
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  const finalParticipantText = buildFinalParticipantText(messageId, recruitData);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(finalParticipantText));

  // Closure note
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('🔒 **この募集は締め切られました** 🔒'));
  
  const recruitIdText = `募集ID：\`${String(messageId).slice(-8)}\` | powered by **Recrubo**`;
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(recruitIdText));
  
  return container;
}

module.exports = {
  processJoin,
  processCancel,
  processClose,
  hexToIntColor,
  buildVoiceLabel
};
