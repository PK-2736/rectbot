const { AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { recruitParticipants } = require('./state');
const { getRecruitFromRedis, getGuildSettings, updateRecruitmentStatus, deleteRecruitmentData, deleteParticipantsFromRedis } = require('../../utils/db');
const { createErrorEmbed } = require('../../utils/embedHelpers');
const { safeReply } = require('../../utils/safeReply');
const { formatVoiceLabel, runInBackground } = require('./handlerUtils');
const { replyEphemeral, logError, logCriticalError } = require('./reply-helpers');
const { hexToIntColor } = require('./ui-builders');

function validateRecruiterPermission(interaction, data) {
  if (!data) {
    return { valid: false, error: '募集データが見つからないため締め切れません。' };
  }
  if (data.recruiterId !== interaction.user.id) {
    return { valid: false, error: '締め切りを実行できるのは募集主のみです。' };
  }
  return { valid: true };
}

async function updateRecruitmentStatusToEnded(messageId) {
  try {
    const statusResult = await updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
    if (statusResult?.ok) {
      return true;
    } else {
      console.warn('管理ページの募集ステータス更新が警告:', statusResult);
      return false;
    }
  } catch (error) {
    console.error('管理ページの募集ステータス更新に失敗:', error);
    return false;
  }
}

async function tryDeleteRecruitmentData(messageId, userId) {
  try {
    const delRes = await deleteRecruitmentData(messageId, userId);
    if (!delRes?.ok && delRes?.status !== 404) {
      console.warn('管理API: 募集データ削除の結果が不正です:', delRes);
    }
  } catch (err) {
    console.error('募集データの削除に失敗:', err);
  }
}

async function tryDeleteParticipantsFromCache(messageId) {
  recruitParticipants.delete(messageId);
  try {
    await deleteParticipantsFromRedis(messageId);
  } catch (e) {
    console.warn('Redis参加者削除失敗:', e?.message || e);
  }
}

async function tryDeleteRecruitFromCache(messageId, data) {
  try {
    const rid = data?.recruitId || String(messageId).slice(-8);
    if (rid) {
      const { deleteRecruitFromRedis } = require('../../utils/db');
      await deleteRecruitFromRedis(rid);
    }
  } catch (e) {
    console.warn('Redis recruit削除失敗:', e?.message || e);
  }
}

async function cleanupRecruitmentData(messageId, userId, data) {
  await tryDeleteRecruitmentData(messageId, userId);
  await tryDeleteParticipantsFromCache(messageId);
  await tryDeleteRecruitFromCache(messageId, data);
}

function resolveClosedRecruitmentLayout(recruitStyle) {
  return recruitStyle === 'image' ? 'image' : 'simple';
}

function prepareClosedRecruitmentContext(data, messageId, interaction, originalMessage) {
  const finalParticipants = recruitParticipants.get(messageId) || [];
  const totalMembers = (typeof data?.participants === 'number') ? data.participants : (typeof data?.participant_count === 'number' ? data.participant_count : null);
  const totalSlots = totalMembers || finalParticipants.length;
  const finalParticipantText = `📋 参加リスト (最終 ${finalParticipants.length}/${totalSlots}人)\n${finalParticipants.map(id => `<@${id}>`).join(' • ')}`;
  const footerMessageId = interaction.message.interaction?.id || interaction.message.id;
  const footerText = `募集ID：\`${footerMessageId.slice(-8)}\` | powered by **Recrubo**`;
  const hasAttachment = !!originalMessage?.attachments && originalMessage.attachments.size > 0;

  return {
    data,
    messageId,
    interaction,
    originalMessage,
    finalParticipants,
    totalMembers,
    totalSlots,
    finalParticipantText,
    footerText,
    hasAttachment
  };
}

async function fetchOriginalImageBuffer(originalMessage) {
  if (!originalMessage?.attachments || originalMessage.attachments.size === 0) {
    return null;
  }

  try {
    const originalAttachmentUrl = originalMessage.attachments.first().url;
    const response = await fetch(originalAttachmentUrl);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (imgErr) {
    console.warn('[processClose] Failed to fetch original image:', imgErr);
    return null;
  }
}

async function generateFallbackImageBuffer(data, finalParticipants, client) {
  try {
    const { generateRecruitCard } = require('../../utils/canvasRecruit');
    let useColor = data?.panelColor || '808080';
    if (typeof useColor === 'string' && useColor.startsWith('#')) useColor = useColor.slice(1);
    if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) useColor = '808080';
    return await generateRecruitCard(data, finalParticipants, client, useColor);
  } catch (imgErr) {
    console.warn('[processClose] Failed to generate base recruit image:', imgErr);
    return null;
  }
}

async function generateClosedImageAttachment(context) {
  const { generateClosedRecruitCard } = require('../../utils/canvasRecruit');

  let baseImageBuffer = await fetchOriginalImageBuffer(context.originalMessage);

  if (!baseImageBuffer) {
    baseImageBuffer = await generateFallbackImageBuffer(context.data, context.finalParticipants, context.interaction.client);
  }

  if (!baseImageBuffer) {
    return null;
  }

  try {
    const closedImageBuffer = await generateClosedRecruitCard(baseImageBuffer);
    return new AttachmentBuilder(closedImageBuffer, { name: 'recruit-card-closed.png' });
  } catch (imgErr) {
    console.warn('[processClose] Failed to generate closed image:', imgErr);
    return null;
  }
}

async function buildImageStyleLayout(context) {
  const closedAttachment = await generateClosedImageAttachment(context);

  return {
    attachment: closedAttachment,
    components: closedAttachment ? [
      { type: 'mediaGallery', url: 'attachment://recruit-card-closed.png' },
      { type: 'separator', spacing: 'Small', divider: true },
      { type: 'text', content: context.finalParticipantText },
      { type: 'separator', spacing: 'Small', divider: true },
      { type: 'text', content: context.footerText }
    ] : [
      { type: 'text', content: context.finalParticipantText },
      { type: 'separator', spacing: 'Small', divider: true },
      { type: 'text', content: context.footerText }
    ]
  };
}

function buildDetailsLabel(data, totalMembers) {
  const startLabel = data?.startTime ? `🕒 ${data.startTime}` : null;
  const membersLabel = (typeof totalMembers === 'number') ? `👥 ${totalMembers}人` : null;
  const voiceLabel = formatVoiceLabel(
    data?.vc || (data?.voice === true ? 'あり' : data?.voice === false ? 'なし' : null),
    data?.voicePlace
  );
  return [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
}

function buildSimpleComponents(context) {
  const components = [
    { type: 'text', content: '🔒 **募集締め切り済み**' }
  ];

  if (context.data?.title) {
    components.push({
      type: 'text',
      content: `📌 タイトル\n${String(context.data.title).slice(0, 200)}`
    });
  }

  components.push({ type: 'separator', spacing: 'Small', divider: true });

  const detailsText = buildDetailsLabel(context.data, context.totalMembers);
  if (detailsText) {
    components.push({ type: 'text', content: detailsText });
  }

  const contentText = context.data?.content ? `📝 募集内容\n${String(context.data.content).slice(0, 1500)}` : '';
  if (contentText) {
    components.push({ type: 'text', content: contentText });
  }

  return components;
}

function buildSimpleStyleLayout(context) {
  const components = buildSimpleComponents(context);

  components.push(
    { type: 'separator', spacing: 'Small', divider: true },
    { type: 'text', content: context.finalParticipantText },
    { type: 'separator', spacing: 'Small', divider: true },
    { type: 'text', content: 'この募集は締め切られました。' },
    { type: 'separator', spacing: 'Small', divider: true },
    { type: 'text', content: context.footerText }
  );

  return {
    attachment: null,
    components
  };
}

function buildClosedCardContainer(layout) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x808080);

  for (const component of layout.components) {
    if (component.type === 'text') {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(component.content));
    } else if (component.type === 'separator') {
      const separator = new SeparatorBuilder().setSpacing(SeparatorSpacingSize[component.spacing]);
      if (component.divider) separator.setDivider(true);
      container.addSeparatorComponents(separator);
    } else if (component.type === 'mediaGallery') {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(component.url)
        )
      );
    }
  }

  return container;
}

async function buildClosedRecruitmentCard({ recruitStyle, data, messageId, interaction, originalMessage }) {
  const context = prepareClosedRecruitmentContext(data, messageId, interaction, originalMessage);
  const layoutType = resolveClosedRecruitmentLayout(recruitStyle);

  const layout = layoutType === 'image'
    ? await buildImageStyleLayout(context)
    : buildSimpleStyleLayout(context);

  const container = buildClosedCardContainer(layout);

  return { container, attachment: layout.attachment };
}

async function sendDeletionNotice(interaction, dedicatedChannelId) {
  try {
    const channel = await interaction.guild.channels.fetch(dedicatedChannelId).catch(() => null);
    if (channel && typeof channel.send === 'function') {
      await channel.send({
        content: '⏰ **募集が締められたので5分後に専用チャンネルを削除します**',
        allowedMentions: { roles: [], users: [] }
      });
    }
  } catch (e) {
    console.warn('[processClose] Failed to send deletion notice:', e?.message || e);
  }
}

async function deleteDedicatedChannelAfterDelay(interaction, dedicatedChannelId, recruitId) {
  setTimeout(async () => {
    try {
      const channel = await interaction.guild.channels.fetch(dedicatedChannelId).catch(() => null);
      if (channel) {
        await channel.delete();
      }
      const { deleteDedicatedChannel } = require('../../utils/db/dedicatedChannels');
      await deleteDedicatedChannel(recruitId);
    } catch (e) {
      console.warn(`[processClose] Failed to delete channel ${dedicatedChannelId}:`, e?.message || e);
    }
  }, 5 * 60 * 1000);
}

function scheduleDedicatedChannelCleanup(interaction, data, messageId) {
  runInBackground(async () => {
    const { getDedicatedChannel } = require('../../utils/db/dedicatedChannels');
    const recruitId = data?.recruitId || String(messageId).slice(-8);
    const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);

    if (!dedicatedChannelId) return;

    await sendDeletionNotice(interaction, dedicatedChannelId);
    await deleteDedicatedChannelAfterDelay(interaction, dedicatedChannelId, recruitId);
  }, 'Dedicated channel cleanup');
}

async function loadRecruitmentData(messageId, savedRecruitData) {
  if (savedRecruitData) return savedRecruitData;

  try {
    const fromRedis = await getRecruitFromRedis(String(messageId).slice(-8));
    if (fromRedis) return fromRedis;
  } catch (e) {
    logError('close: getRecruitFromRedis failed', e);
  }
  return null;
}

async function getRecruitStyle(guildId) {
  try {
    const guildSettings = await getGuildSettings(guildId);
    return (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
  } catch (e) {
    logError('[processClose] Failed to get guild settings, defaulting to image style', e);
    return 'image';
  }
}

function buildCloseNotificationEmbed(data, finalParticipants) {
  const closeColor = hexToIntColor(data?.panelColor || '808080', 0x808080);
  return new EmbedBuilder()
    .setColor(closeColor)
    .setTitle('🔒 募集締切')
    .setDescription(`**${data.title}** の募集を締め切りました。`)
    .addFields({ name: '最終参加者数', value: `${finalParticipants.length}/${data.participants}人`, inline: false });
}

async function sendCloseNotification(interaction, data, messageId) {
  if (!data || !data.recruiterId) {
    await replyEphemeral(interaction, {
      content: '🔒 募集を締め切りました。'
    });
    return;
  }

  const finalParticipants = recruitParticipants.get(messageId) || [];
  const closeEmbed = buildCloseNotificationEmbed(data, finalParticipants);

  try {
    await safeReply(interaction, {
      content: `<@${data.recruiterId}>`,
      embeds: [closeEmbed],
      allowedMentions: { users: [data.recruiterId] }
    });
  } catch (e) {
    logError('safeReply failed during close handling', e);
  }

  scheduleDedicatedChannelCleanup(interaction, data, messageId);
}

async function updateMessageWithClosedCard({ interaction, messageId, recruitStyle, data }) {
  const { container, attachment } = await buildClosedRecruitmentCard({
    recruitStyle,
    data,
    messageId,
    interaction,
    originalMessage: interaction.message
  });

  const editPayload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  };

  if (recruitStyle === 'image' && attachment) {
    editPayload.files = [attachment];
  }

  await interaction.message.edit(editPayload);
}

async function processClose(interaction, messageId, savedRecruitData) {
  try {
    const data = await loadRecruitmentData(messageId, savedRecruitData);

    const validation = validateRecruiterPermission(interaction, data);
    if (!validation.valid) {
      await replyEphemeral(interaction, {
        embeds: [createErrorEmbed(validation.error, '権限エラー')]
      });
      return;
    }

    const statusUpdateSuccess = await updateRecruitmentStatusToEnded(messageId);

    const recruitStyle = await getRecruitStyle(interaction.guildId);

    await updateMessageWithClosedCard({ interaction, messageId, recruitStyle, data });

    await sendCloseNotification(interaction, data, messageId);

    // クリーンアップは参加者リストを使用する処理の後に実行
    if (statusUpdateSuccess) {
      await cleanupRecruitmentData(messageId, interaction.user.id, data);
    }
  } catch (e) {
    logCriticalError('close button handler error', e);
  }
}

module.exports = {
  processClose
};
