const { AttachmentBuilder, MessageFlags } = require('discord.js');
const db = require('./db');

function hydrateBasicFields(recruit) {
  if (!recruit.guildId && recruit.metadata?.guildId) recruit.guildId = recruit.metadata.guildId;
  if (!recruit.channelId && recruit.metadata?.channelId) recruit.channelId = recruit.metadata.channelId;
  if (!recruit.message_id && recruit.metadata?.messageId) recruit.message_id = recruit.metadata.messageId;
  if (!recruit.messageId && recruit.metadata?.messageId) recruit.messageId = recruit.metadata.messageId;
}

function hydrateOwnerFields(recruit) {
  if (!recruit.recruiterId && recruit.ownerId) recruit.recruiterId = recruit.ownerId;
  if (!recruit.ownerId && recruit.recruiterId) recruit.ownerId = recruit.recruiterId;
}

function hydrateMetadataFields(recruit) {
  if (!recruit.panelColor && recruit.metadata?.panelColor) recruit.panelColor = recruit.metadata.panelColor;
  if (!recruit.vc && recruit.metadata?.vc) recruit.vc = recruit.metadata.vc;
  if (!recruit.note && recruit.metadata?.note) recruit.note = recruit.metadata.note;
  if (!recruit.content && recruit.metadata?.raw?.content) recruit.content = recruit.metadata.raw.content;
}

function hydrateTitleField(recruit) {
  if (!recruit.title) {
    recruit.title = recruit.metadata?.raw?.title || recruit.metadata?.title || recruit.description || '募集';
  }
}

function hydrateParticipantsField(recruit) {
  if (!recruit.participants && Array.isArray(recruit.metadata?.raw?.participants)) {
    recruit.participants = recruit.metadata.raw.participants;
  }
}

function hydrateRecruitData(recruit) {
  if (!recruit || typeof recruit !== 'object') return recruit;
  try {
    hydrateBasicFields(recruit);
    hydrateOwnerFields(recruit);
    hydrateMetadataFields(recruit);
    hydrateTitleField(recruit);
    hydrateParticipantsField(recruit);
  } catch (e) {
    console.warn('hydrateRecruitData failed:', e?.message || e);
  }
  return recruit;
}

function resolveMessageContext(interactionOrMessage) {
  let interaction = null;
  let message = null;
  if (interactionOrMessage && interactionOrMessage.message) {
    interaction = interactionOrMessage;
    message = interaction.message;
  } else {
    message = interactionOrMessage;
  }
  const client = (interaction && interaction.client) || (message && message.client);
  const messageIdStr = message?.id ? String(message.id) : null;
  const recruitId = messageIdStr ? messageIdStr.slice(-8) : null;
  return { interaction, message, client, messageIdStr, recruitId };
}

async function fetchRecruitData(recruitId, savedRecruitData) {
  if (savedRecruitData) return savedRecruitData;
  if (!recruitId) return null;

  try {
    const fromRedis = await db.getRecruitFromRedis(recruitId);
    if (fromRedis) return fromRedis;
    
    const fromWorker = await db.getRecruitFromWorker(recruitId);
    if (fromWorker?.ok && fromWorker.body) {
      const data = fromWorker.body;
      try { await db.saveRecruitToRedis(recruitId, data); } catch (_) {}
      return data;
    }
  } catch (e) {
    console.warn('fetchRecruitData: fallback fetch failed:', e?.message || e);
  }
  return null;
}

function normalizeColor(color) {
  let useColor = color || '000000';
  if (typeof useColor === 'string' && useColor.startsWith('#')) useColor = useColor.slice(1);
  if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) useColor = '000000';
  return useColor;
}

async function generateRecruitImageIfNeeded(style, recruitData, participants, client, color) {
  if (style !== 'image') return null;
  const { generateRecruitCard } = require('./canvasRecruit');
  const buffer = await generateRecruitCard(recruitData, participants, client, color);
  return new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
}

function buildParticipantText(participants, totalSlots) {
  const remainingSlots = totalSlots - participants.length;
  return `📋 参加リスト (**あと${remainingSlots}人**)
${participants.map(id => `<@${id}>`).join(' • ')}`;
}

function buildNotificationRoleText(selectedNotificationRole) {
  if (!selectedNotificationRole) return null;
  if (selectedNotificationRole === 'everyone') return '🔔 通知ロール: @everyone';
  if (selectedNotificationRole === 'here') return '🔔 通知ロール: @here';
  return `🔔 通知ロール: <@&${selectedNotificationRole}>`;
}

async function fetchRecruiterInfo(recruiterId, client) {
  if (!recruiterId || !client) return { headerTitle: '募集', avatarUrl: null };
  
  try {
    const user = await client.users.fetch(recruiterId).catch(() => null);
    if (!user) return { headerTitle: '募集', avatarUrl: null };
    
    const name = user.username || user.displayName || user.tag;
    const headerTitle = name ? `${name}さんの募集` : '募集';
    const avatarUrl = typeof user.displayAvatarURL === 'function'
      ? user.displayAvatarURL({ size: 64, extension: 'png' })
      : null;
    
    return { headerTitle, avatarUrl };
  } catch (e) {
    console.warn('fetchRecruiterInfo failed:', e?.message || e);
    return { headerTitle: '募集', avatarUrl: null };
  }
}

function buildExtraActionButtons(guildSettings, recruitData, recruitId) {
  try {
    const { ButtonBuilder, ButtonStyle } = require('discord.js');
    const enableDedicated = Boolean(guildSettings?.enable_dedicated_channel);
    const isNowStart = String(recruitData?.startTime || '').trim() === '今から';
    
    if (enableDedicated && isNowStart && recruitId) {
      return [
        new ButtonBuilder()
          .setCustomId(`create_vc_${recruitId}`)
          .setLabel('専用チャンネル作成')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Primary)
      ];
    }
  } catch (e) {
    console.warn('buildExtraActionButtons failed:', e?.message || e);
  }
  return [];
}

function buildVoiceValue(recruitData) {
  if (typeof recruitData?.vc === 'string') {
    if (recruitData.vc === 'あり(聞き専)') {
      return recruitData?.voicePlace ? `聞き専/${recruitData.voicePlace}` : '聞き専';
    } else if (recruitData.vc === 'あり') {
      return recruitData?.voicePlace ? `あり/${recruitData.voicePlace}` : 'あり';
    } else if (recruitData.vc === 'なし') {
      return 'なし';
    }
  } else if (recruitData?.voice === true) {
    return recruitData?.voicePlace ? `あり/${recruitData.voicePlace}` : 'あり';
  } else if (recruitData?.voice === false) {
    return 'なし';
  }
  return null;
}

function buildSimpleStyleContainer(options) {
  const { recruitData, participantText, recruitIdText, accentColor, headerTitle, subHeaderText, avatarUrl, extraActionButtons } = options;
  
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  const startVal = recruitData?.startTime ? String(recruitData.startTime) : null;
  const totalSlots = recruitData?.participants || recruitData?.participant_count;
  const membersVal = typeof totalSlots === 'number' ? `${totalSlots}人` : null;
  const voiceVal = buildVoiceValue(recruitData);
  const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
  const details = [labelsLine, valuesLine].filter(Boolean).join('\n');
  
  const contentTextValue = recruitData?.note || recruitData?.content || '';
  const contentText = contentTextValue && String(contentTextValue).trim().length > 0
    ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}`
    : '';
  
  const { buildContainerSimple } = require('./recruitHelpers');
  return buildContainerSimple({
    headerTitle,
    detailsText: details,
    contentText,
    titleText: (recruitData?.title ? `## ${String(recruitData.title).slice(0,200)}` : ''),
    participantText,
    recruitIdText,
    accentColor,
    subHeaderText,
    avatarUrl,
    extraActionButtons
  });
}

function buildImageStyleContainer(options) {
  const { recruitData, participantText, recruitIdText, accentColor, headerTitle, subHeaderText, avatarUrl, recruiterId, requesterId, extraActionButtons } = options;
  
  const contentText = recruitData?.note || recruitData?.content || '';
  const { buildContainer } = require('./recruitHelpers');
  return buildContainer({
    headerTitle,
    contentText,
    titleText: (recruitData?.title ? `📌 タイトル\n${String(recruitData.title).slice(0,200)}` : ''),
    participantText,
    recruitIdText,
    accentColor,
    imageAttachmentName: 'attachment://recruit-card.png',
    recruiterId,
    requesterId,
    subHeaderText,
    avatarUrl,
    extraActionButtons
  });
}

async function prepareRecruitDataForUpdate(recruitId, savedRecruitData) {
  savedRecruitData = await fetchRecruitData(recruitId, savedRecruitData);
  
  if (!savedRecruitData) {
    return null;
  }
  
  savedRecruitData = hydrateRecruitData(savedRecruitData);
  if (recruitId) {
    try { 
      await db.saveRecruitToRedis(recruitId, savedRecruitData); 
    } catch (_) {}
  }
  
  return savedRecruitData;
}

async function fetchStyleAndSettings(savedRecruitData, guildId) {
  const guildSettings = await db.getGuildSettings(guildId);
  const useColor = normalizeColor(savedRecruitData?.panelColor || guildSettings?.defaultColor);
  const style = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
  const accentColor = parseInt(useColor, 16);
  
  return { guildSettings, useColor, style, accentColor };
}

function buildRecruitIdText(savedRecruitData, messageIdStr) {
  if (savedRecruitData?.recruitId) {
    return savedRecruitData.recruitId;
  }
  if (savedRecruitData?.message_id) {
    return savedRecruitData.message_id.slice(-8);
  }
  if (messageIdStr) {
    return messageIdStr.slice(-8);
  }
  return '(unknown)';
}

function resolveActualRecruitId(recruitId, recruitIdText) {
  if (recruitId) return recruitId;
  if (recruitIdText && recruitIdText !== '(unknown)') return recruitIdText;
  return null;
}

async function buildContainerOptions(savedRecruitData, participants, context, styleSettings) {
  const { client, messageIdStr, recruitId, interaction } = context;
  const { accentColor, guildSettings } = styleSettings;
  
  const totalSlots = savedRecruitData?.participants || savedRecruitData?.participant_count || 1;
  const participantText = buildParticipantText(participants, totalSlots);
  const subHeaderText = buildNotificationRoleText(savedRecruitData?.notificationRoleId);
  const { headerTitle, avatarUrl } = await fetchRecruiterInfo(savedRecruitData?.recruiterId, client);
  
  const recruiterId = savedRecruitData?.recruiterId || null;
  const requesterId = interaction ? interaction.user?.id : null;
  const recruitIdText = buildRecruitIdText(savedRecruitData, messageIdStr);
  const actualRecruitId = resolveActualRecruitId(recruitId, recruitIdText);
  const extraActionButtons = buildExtraActionButtons(guildSettings, savedRecruitData, actualRecruitId);
  
  return {
    recruitData: savedRecruitData,
    participantText,
    recruitIdText,
    accentColor,
    headerTitle,
    subHeaderText,
    avatarUrl,
    extraActionButtons,
    recruiterId,
    requesterId
  };
}

function selectContainer(style, containerOptions) {
  if (style === 'simple') {
    return buildSimpleStyleContainer(containerOptions);
  }
  return buildImageStyleContainer(containerOptions);
}

async function buildUpdatePayload(savedRecruitData, participants, context) {
  const { client } = context;
  const guildId = savedRecruitData?.guildId || context.guildId;
  
  const styleSettings = await fetchStyleAndSettings(savedRecruitData, guildId);
  const { style, useColor } = styleSettings;
  
  const updatedImage = await generateRecruitImageIfNeeded(style, savedRecruitData, participants, client, useColor);
  const containerOptions = await buildContainerOptions(savedRecruitData, participants, context, styleSettings);
  const updatedContainer = selectContainer(style, containerOptions);

  const editPayload = { 
    components: [updatedContainer], 
    flags: MessageFlags.IsComponentsV2, 
    allowedMentions: { roles: [], users: [] } 
  };
  
  if (style === 'image' && updatedImage) {
    editPayload.files = [updatedImage];
  }

  return editPayload;
}

async function updateParticipantList(interactionOrMessage, participants, savedRecruitData) {
  try {
    const { interaction, message, client, messageIdStr, recruitId } = resolveMessageContext(interactionOrMessage);
    const guildId = (interaction && interaction.guildId) || (message && message.guildId);

    savedRecruitData = await prepareRecruitDataForUpdate(recruitId, savedRecruitData);

    if (!savedRecruitData) {
      console.warn('updateParticipantList: savedRecruitData unavailable; persisting participants only');
      if (message && message.id) {
        try { await db.saveParticipantsToRedis(message.id, participants); } catch (_) {}
      }
      return;
    }

    const context = { client, messageIdStr, recruitId, interaction, guildId };
    const editPayload = await buildUpdatePayload(savedRecruitData, participants, context);

    if (message && message.edit) {
      await message.edit(editPayload);
    }

    if (message && message.id) {
      await db.saveParticipantsToRedis(message.id, participants);
    }
  } catch (err) {
    console.error('updateParticipantList error:', err);
  }
}

async function fetchRecruitDataForClose(recruitId) {
  let savedRecruitData = null;
  try { 
    savedRecruitData = await db.getRecruitFromRedis(recruitId); 
  } catch (e) { 
    console.warn('[autoClose] getRecruitFromRedis failed:', e?.message || e); 
  }
  
  if (!savedRecruitData) {
    const workerRes = await db.getRecruitFromWorker(recruitId);
    if (workerRes?.ok) savedRecruitData = workerRes.body;
  }
  
  return savedRecruitData ? hydrateRecruitData(savedRecruitData) : null;
}

async function getRecruitStyle(guildId) {
  try {
    const guildSettings = await db.getGuildSettings(guildId);
    return (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
  } catch (e) {
    console.warn('[autoClose] Failed to get guild settings, defaulting to image style:', e?.message || e);
    return 'image';
  }
}

async function fetchChannelAndMessage(client, channelId, messageId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return { channel: null, message: null };
  const message = await channel.messages.fetch(messageId).catch(() => null);
  return { channel, message };
}

function resolveBaseColor(savedRecruitData) {
  const src = (savedRecruitData && savedRecruitData.panelColor) || '808080';
  const cleaned = typeof src === 'string' && src.startsWith('#') ? src.slice(1) : src;
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : 0x808080;
}

async function generateClosedImage(message) {
  const { AttachmentBuilder } = require('discord.js');
  const { generateClosedRecruitCard } = require('./canvasRecruit');
  
  const originalAttachment = message.attachments.first();
  if (!originalAttachment || !originalAttachment.url) return null;
  
  try {
    const response = await fetch(originalAttachment.url);
    const arrayBuffer = await response.arrayBuffer();
    const originalImageBuffer = Buffer.from(arrayBuffer);
    const closedImageBuffer = await generateClosedRecruitCard(originalImageBuffer);
    return new AttachmentBuilder(closedImageBuffer, { name: 'recruit-card-closed.png' });
  } catch (imgErr) {
    console.warn('[autoClose] Failed to generate closed image:', imgErr);
    return null;
  }
}

function buildClosedImageContainer(baseColor, closedAttachment, recruitId) {
  const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
  
  const container = new ContainerBuilder();
  container.setAccentColor(baseColor);
  
  if (closedAttachment) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://recruit-card-closed.png')
      )
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
  }
  
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`募集ID：\`${recruitId}\` | powered by **Recrubo**`)
  );
  
  return container;
}

function buildClosedSimpleContainer(baseColor, recruitId) {
  const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
  
  const container = new ContainerBuilder();
  container.setAccentColor(baseColor);
  
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('🔒 **募集締め切り済み**')
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('この募集は締め切られました。')
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`募集ID：\`${recruitId}\` | powered by **Recrubo**`)
  );
  
  return container;
}

function buildDisabledButtonRow() {
  const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('participate_disabled')
        .setLabel('参加する')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('cancel_disabled')
        .setLabel('取り消す')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
}

async function tryUpdateRecruitmentStatus(messageId) {
  try {
    const statusRes = await db.updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
    if (!statusRes?.ok) {
      console.warn('[autoClose] Status update returned warning:', statusRes);
    }
  } catch (e) {
    console.warn('[autoClose] Failed to update status:', e?.message || e);
  }
}

async function tryDeleteRecruitmentData(messageId, recruiterId) {
  try {
    const deleteRes = await db.deleteRecruitmentData(messageId, recruiterId);
    if (!deleteRes?.ok && deleteRes?.status !== 404) {
      console.warn('[autoClose] Recruitment delete returned warning:', deleteRes);
    }
  } catch (e) {
    console.warn('[autoClose] Failed to delete recruitment from Durable Object:', e?.message || e);
  }
}

async function tryDeleteParticipants(messageId) {
  try {
    await db.deleteParticipantsFromRedis(messageId);
  } catch (e) {
    console.warn('[autoClose] deleteParticipantsFromRedis failed:', e?.message || e);
  }
}

async function tryDeleteRecruit(recruitId) {
  if (!recruitId) return;
  try {
    await db.deleteRecruitFromRedis(recruitId);
  } catch (e) {
    console.warn('[autoClose] deleteRecruitFromRedis failed:', e?.message || e);
  }
}

async function cleanupRecruitmentCaches(messageId, recruitId, recruiterId) {
  await tryUpdateRecruitmentStatus(messageId);
  await tryDeleteRecruitmentData(messageId, recruiterId);
  await tryDeleteParticipants(messageId);
  await tryDeleteRecruit(recruitId);
}

async function prepareAutoCloseData(client, guildId, channelId, messageId) {
  if (!client) throw new Error('client unavailable');

  const recruitId = String(messageId).slice(-8);
  const savedRecruitData = await fetchRecruitDataForClose(recruitId);
  const recruiterId = savedRecruitData?.recruiterId || savedRecruitData?.ownerId || null;
  const recruitStyle = await getRecruitStyle(guildId);
  const { channel, message } = await fetchChannelAndMessage(client, channelId, messageId);

  return { recruitId, savedRecruitData, recruiterId, recruitStyle, channel, message };
}

async function buildClosedPayload(savedRecruitData, recruitStyle, recruitId, message) {
  const { MessageFlags } = require('discord.js');
  
  const baseColor = resolveBaseColor(savedRecruitData);
  let closedAttachment = null;
  
  if (recruitStyle === 'image') {
    closedAttachment = await generateClosedImage(message);
  }
  
  const disabledContainer = recruitStyle === 'image'
    ? buildClosedImageContainer(baseColor, closedAttachment, recruitId)
    : buildClosedSimpleContainer(baseColor, recruitId);
  
  const disabledButtons = buildDisabledButtonRow();
  
  const editPayload = {
    components: [disabledContainer, disabledButtons],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  };
  
  if (recruitStyle === 'image' && closedAttachment) {
    editPayload.files = [closedAttachment];
  }
  
  return editPayload;
}

async function updateMessageForAutoClose(message, savedRecruitData, recruitStyle, recruitId) {
  try {
    const editPayload = await buildClosedPayload(savedRecruitData, recruitStyle, recruitId, message);
    await message.edit(editPayload);
  } catch (e) {
    console.warn('[autoClose] Failed to edit message during auto close:', e?.message || e);
  }
}

async function sendAutoCloseReply(message, recruiterId) {
  try {
    await message.reply({
      content: `🔒 自動締切: この募集は有効期限切れのため締め切りました。`,
      allowedMentions: { roles: [], users: recruiterId ? [recruiterId] : [] }
    }).catch(() => null);
  } catch (_) {}
}

async function autoCloseRecruitment(client, guildId, channelId, messageId) {
  console.log('[autoClose] Triggered for message:', messageId, 'guild:', guildId, 'channel:', channelId);
  try {
    const { recruitId, savedRecruitData, recruiterId, recruitStyle, message } = 
      await prepareAutoCloseData(client, guildId, channelId, messageId);

    if (message) {
      await updateMessageForAutoClose(message, savedRecruitData, recruitStyle, recruitId);
      await sendAutoCloseReply(message, recruiterId);
    } else {
      console.warn('[autoClose] Message not found (manual deletion or already deleted):', messageId);
    }

    await cleanupRecruitmentCaches(messageId, recruitId, recruiterId);
    console.log('[autoClose] Completed for message:', messageId, '- All caches cleared regardless of message existence');
  } catch (error) {
    console.error('[autoClose] Unexpected error:', error);
  }
}

module.exports = { updateParticipantList, autoCloseRecruitment };
