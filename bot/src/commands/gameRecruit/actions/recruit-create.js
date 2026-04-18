const { MessageFlags, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recruitParticipants, pendingModalOptions } = require('../data/state');
const { createErrorEmbed } = require('../../../utils/embedHelpers');
const { getGuildSettings, listRecruitsFromRedis, saveRecruitmentData, saveRecruitToRedis, saveParticipantsToRedis, pushRecruitToWebAPI, getCooldownRemaining, setCooldown, getTemplateByName } = require('../../../utils/database');
const { buildContainer, buildContainerSimple } = require('../../../utils/recruitHelpers');
const { generateRecruitCardQueued } = require('../../../utils/imageQueue');
const { EXEMPT_GUILD_IDS } = require('../data/constants');
const { handlePermissionError } = require('../../../utils/handlePermissionError');
const { formatVoiceLabel, fetchUserAvatarUrl } = require('../utils/handlerUtils');
const { replyEphemeral, logError, logCriticalError } = require('../utils/reply-helpers');
const { isValidParticipantsNumber, isPermissionError, isUnknownInteractionError } = require('../validation/validation-helpers');
const { buildConfiguredNotificationRoleIds, sendAnnouncements } = require('../notifications/announcements');
const { scheduleStartTimeNotification } = require('../utils/start-time');
const backendFetch = require('../../../utils/common/backendFetch');

function isGuildExempt(guildId) {
  return EXEMPT_GUILD_IDS.has(String(guildId));
}

function isPremiumEnabled(guildSettings) {
  return !!(guildSettings?.premium_enabled || guildSettings?.enable_dedicated_channel);
}

async function hasPremiumSubscription(userId, guildId) {
  if (!userId) return false;
  try {
    const params = new URLSearchParams({ userId: String(userId) });
    if (guildId) params.set('guildId', String(guildId));

    const status = await backendFetch(`/api/stripe/bot/subscription-status?${params.toString()}`, {
      method: 'GET'
    });

    return !!(
      status?.isPremium ||
      status?.guildSubscription?.premium_enabled ||
      status?.guildSubscription?.enable_dedicated_channel
    );
  } catch (error) {
    logError('[recruit-create] failed to fetch subscription status', error);
    return false;
  }
}

async function enforceCooldown(interaction, skipCooldown = false) {
  try {
    if (isGuildExempt(interaction.guildId)) return true;
    if (skipCooldown) return true;
    const remaining = await getCooldownRemaining(`rect:${interaction.guildId}`);
    if (remaining > 0) {
      const mm = Math.floor(remaining / 60);
      const ss = remaining % 60;
      await replyEphemeral(interaction, {
        content: `⏳ このサーバーの募集コマンドはクールダウン中です。あと ${mm}:${ss.toString().padStart(2, '0')} 待ってから再度お試しください。`
      });
      return false;
    }
    return true;
  } catch (e) {
    logError('[rect cooldown check] failed', e);
    return true;
  }
}

function extractGuildId(recruit) {
  return String(recruit?.guildId ?? recruit?.guild_id ?? recruit?.guild ?? recruit?.metadata?.guildId ?? recruit?.metadata?.guild ?? '');
}

function isRecruitActive(recruit, guildIdStr) {
  const gid = extractGuildId(recruit);
  const status = String(recruit?.status ?? '').toLowerCase();
  return gid === guildIdStr && (status === 'recruiting' || status === 'active');
}

async function notifyRecruitLimit(interaction) {
  await replyEphemeral(interaction, {
    embeds: [createErrorEmbed('このサーバーでは同時に実行できる募集は3件までです。\n既存の募集をいくつか締め切ってから新しい募集を作成してください。', '募集上限到達')]
  });
}

async function ensureNoActiveRecruit(interaction, guildSettings, premiumEnabled = false) {
  if (isGuildExempt(interaction.guildId)) return true;
  if (premiumEnabled) return true;
  if (isPremiumEnabled(guildSettings)) return true;

  const premiumBySubscription = await hasPremiumSubscription(interaction.user?.id, interaction.guildId);
  if (premiumBySubscription) return true;

  try {
    const allRecruits = await listRecruitsFromRedis();
    const guildIdStr = String(interaction.guildId);
    if (Array.isArray(allRecruits)) {
      const matched = allRecruits.filter(r => isRecruitActive(r, guildIdStr));
      if (matched.length >= 3) {
        await notifyRecruitLimit(interaction);
        return false;
      }
    }
    return true;
  } catch (e) {
    logError('listRecruitsFromRedis failed', e);
    return true;
  }
}

function parseParticipantsNumFromModal(interaction) {
  const pending = interaction.user && interaction.user.id ? pendingModalOptions.get(interaction.user.id) : null;
  const participantsNum = pending?.participants;
  if (!isValidParticipantsNumber(participantsNum)) {
    return null;
  }
  return participantsNum;
}

function normalizeHex(color, fallback = '000000') {
  let use = color;
  if (typeof use === 'string' && use.startsWith('#')) use = use.slice(1);
  if (typeof use !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(use)) return fallback;
  return use;
}

function getPendingPanelColor(interaction) {
  const pending = interaction.user && interaction.user.id ? pendingModalOptions.get(interaction.user.id) : null;
  if (pending && typeof pending.panelColor === 'string' && pending.panelColor.length > 0) {
    return pending.panelColor;
  }
  return null;
}

function getInteractionPanelColor(interaction) {
  if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) {
    return interaction.recruitPanelColor;
  }
  return null;
}

function getDefaultPanelColor(guildSettings) {
  return guildSettings.defaultColor || '000000';
}

function resolvePanelColor(interaction, guildSettings) {
  try {
    return getPendingPanelColor(interaction) ||
           getInteractionPanelColor(interaction) ||
           getDefaultPanelColor(guildSettings);
  } catch (e) {
    logError('handleModalSubmit: failed to retrieve pending modal options', e);
    return getInteractionPanelColor(interaction) || getDefaultPanelColor(guildSettings);
  }
}

function generateRecruitId(messageId) {
  return messageId.slice(-8);
}

function prepareFinalRecruitData(recruitDataObj, actualRecruitId, interaction, actualMessageId, guildSettings, premiumEnabled) {
  const ttlHours = premiumEnabled ? 24 : 8;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  return {
    ...recruitDataObj,
    recruitId: actualRecruitId,
    ownerId: recruitDataObj.recruiterId || interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    message_id: actualMessageId,
    status: 'recruiting',
    expiresAt,
    premiumEnabled,
    start_time: new Date().toISOString(),
    startTimeNotified: false
  };
}

async function saveToRedisAndPushToApi(actualRecruitId, finalRecruitData) {
  await saveRecruitToRedis(actualRecruitId, finalRecruitData);
  const pushRes = await pushRecruitToWebAPI(finalRecruitData);
  if (!pushRes || !pushRes.ok) logCriticalError('Worker API push failed', pushRes);
}

async function syncToWorkerDurableObject(interaction, actualMessageId, finalRecruitData) {
  try {
    const workerSave = await saveRecruitmentData(
      interaction.guildId,
      interaction.channelId,
      actualMessageId,
      interaction.guild?.name,
      interaction.channel?.name,
      finalRecruitData
    );
    if (!workerSave?.ok) logCriticalError('[worker-sync] DO 保存失敗', workerSave);
  } catch (saveErr) {
    logCriticalError('[worker-sync] saveRecruitmentData error', saveErr);
  }
}

async function persistRecruitmentData(finalRecruitData, interaction, actualMessageId, actualRecruitId) {
  try {
    await saveToRedisAndPushToApi(actualRecruitId, finalRecruitData);
    await syncToWorkerDurableObject(interaction, actualMessageId, finalRecruitData);
  } catch (err) {
    logCriticalError('Redis保存またはAPI pushエラー', err);
  }
}

async function sendWebhookNotification(finalRecruitData, interaction, actualMessageId, avatarUrl) {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[webhook] DISCORD_WEBHOOK_URL is not set. Skip recruit webhook notification.');
      return;
    }
    const messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${actualMessageId}`;

    const webhookEmbed = {
      title: '🎮 新しい募集が作成されました',
      description: finalRecruitData.title || '募集タイトルなし',
      color: parseInt(finalRecruitData.panelColor || '5865F2', 16),
      fields: [
        { name: '開始時間', value: finalRecruitData.startTime || '未設定', inline: true },
        { name: '募集人数', value: `${finalRecruitData.participants || 0}人`, inline: true },
        { name: '通話', value: finalRecruitData.vc || 'なし', inline: true },
        { name: 'サーバー', value: interaction.guild?.name || 'Unknown', inline: true },
        { name: 'チャンネル', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'リンク', value: `[募集を見る](${messageUrl})`, inline: true }
      ],
      author: {
        name: interaction.user.username,
        icon_url: avatarUrl || interaction.user.displayAvatarURL()
      },
      timestamp: new Date().toISOString()
    };

    if (finalRecruitData.content) {
      webhookEmbed.fields.push({
        name: '募集内容',
        value: String(finalRecruitData.content).slice(0, 1024)
      });
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [webhookEmbed] })
    });

    console.log('[webhook] 募集通知を送信しました:', finalRecruitData.recruitId);
  } catch (webhookErr) {
    logCriticalError('[webhook] 募集通知の送信に失敗', webhookErr);
  }
}

function formatContentText(finalRecruitData) {
  const contentTextValue = finalRecruitData?.content || finalRecruitData?.note || finalRecruitData?.description || '';
  return contentTextValue && String(contentTextValue).trim().length > 0
    ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}`
    : '';
}

function createVoiceChannelButton(actualRecruitId) {
  return new ButtonBuilder()
    .setCustomId(`create_vc_${actualRecruitId}`)
    .setLabel('専用チャンネル作成')
    .setEmoji('📢')
    .setStyle(ButtonStyle.Primary);
}

function buildExtraButtonsForRecruit(finalRecruitData, actualRecruitId) {
  if (finalRecruitData?.startTime === '今から') {
    return [createVoiceChannelButton(actualRecruitId)];
  }
  return [];
}

function buildSimpleStyleDetails(finalRecruitData) {
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  const startVal = finalRecruitData?.startTime ? String(finalRecruitData.startTime) : null;
  const membersVal = typeof finalRecruitData?.participants === 'number' ? `${finalRecruitData.participants}人` : null;
  const voiceVal = formatVoiceLabel(finalRecruitData?.vc, finalRecruitData?.voicePlace);
  const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
  return `${labelsLine}\n${valuesLine}`;
}

async function updateRecruitmentMessage({
  actualMessage,
  finalRecruitData,
  currentParticipants,
  interaction,
  guildSettings,
  user,
  participantText,
  subHeaderText,
  avatarUrl,
  actualRecruitId
}) {
  let finalUseColor = finalRecruitData.panelColor || guildSettings.defaultColor || '000000';
  finalUseColor = normalizeHex(finalUseColor, '000000');

  const styleForEdit = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
  let updatedImage = null;

  if (styleForEdit === 'image') {
    const updatedImageBuffer = await generateRecruitCardQueued(
      finalRecruitData,
      currentParticipants,
      interaction.client,
      finalUseColor
    );
    updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });
  }

  const finalAccentColor = /^[0-9A-Fa-f]{6}$/.test(finalUseColor) ? parseInt(finalUseColor, 16) : 0x000000;
  const contentText = formatContentText(finalRecruitData);
  const extraButtons = buildExtraButtonsForRecruit(finalRecruitData, actualRecruitId);
  
  const updatedContainer = styleForEdit === 'simple'
    ? buildContainerSimple({
        headerTitle: `${user.username}さんの募集`,
        detailsText: buildSimpleStyleDetails(finalRecruitData),
        contentText,
        titleText: finalRecruitData?.title ? `## ${String(finalRecruitData.title).slice(0,200)}` : '',
        participantText,
        recruitIdText: actualRecruitId,
        accentColor: finalAccentColor,
        subHeaderText,
        avatarUrl,
        extraActionButtons: extraButtons
      })
    : buildContainer({
        headerTitle: `${user.username}さんの募集`,
        subHeaderText,
        contentText,
        titleText: '',
        participantText,
        recruitIdText: actualRecruitId,
        accentColor: finalAccentColor,
        imageAttachmentName: 'attachment://recruit-card.png',
        recruiterId: interaction.user.id,
        requesterId: interaction.user.id,
        extraActionButtons: extraButtons
      });

  try {
    const editPayload = {
      components: [updatedContainer],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { roles: [], users: [] }
    };
    if (updatedImage) editPayload.files = [updatedImage];
    await actualMessage.edit(editPayload);
  } catch (editError) {
    logCriticalError('メッセージ更新エラー', editError);
  }
}

async function finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, premiumEnabled = false, user, participantText, subHeaderText, followUpMessage, currentParticipants }) {
  const actualMessage = followUpMessage;
  const actualMessageId = actualMessage.id;
  const actualRecruitId = generateRecruitId(actualMessageId);

  const finalRecruitData = prepareFinalRecruitData(recruitDataObj, actualRecruitId, interaction, actualMessageId, guildSettings, premiumEnabled);

  const avatarUrl = await fetchUserAvatarUrl(interaction.client, interaction.user.id);

  await persistRecruitmentData(finalRecruitData, interaction, actualMessageId, actualRecruitId);

  await sendWebhookNotification(finalRecruitData, interaction, actualMessageId, avatarUrl);

  recruitParticipants.set(actualMessageId, currentParticipants);
  try {
    await saveParticipantsToRedis(actualMessageId, currentParticipants);
  } catch (e) {
    logError('初期参加者のRedis保存に失敗', e);
  }

  await updateRecruitmentMessage({
    actualMessage,
    finalRecruitData,
    currentParticipants,
    interaction,
    guildSettings,
    user,
    participantText,
    subHeaderText,
    avatarUrl,
    actualRecruitId
  });

  scheduleStartTimeNotification({
    finalRecruitData,
    interaction,
    actualMessageId,
    actualRecruitId,
    guildSettings
  });

  try {
    if (!isGuildExempt(interaction.guildId) && !premiumEnabled) {
      await setCooldown(`rect:${interaction.guildId}`, 60);
    }
  } catch (e) {
    logError('[rect cooldown set at submit] failed', e);
  }
}

function resolveExistingMembers(interaction) {
  try {
    const selectedMembers = interaction.fields.getSelectedMembers('existingMembers');
    if (selectedMembers && selectedMembers.size > 0) {
      return Array.from(selectedMembers.keys()).filter(id => {
        const member = selectedMembers.get(id);
        return id !== interaction.user.id && !(member?.user?.bot);
      });
    }
  } catch (_e) {
  }
  return [];
}

function resolveNotificationRole(interaction) {
  try {
    const values = interaction.fields.getStringSelectValues('notificationRole');
    if (values && values.length > 0) {
      const roleId = values[0];
      if (roleId === 'none') {
        return null;
      } else if (roleId === 'everyone' || roleId === 'here') {
        return roleId;
      } else {
        return roleId;
      }
    }
  } catch (_e) {
  }
  return null;
}

async function resolveVoiceChannelName(interaction, voiceChannelId) {
  if (!voiceChannelId) return null;

  try {
    const voiceChannel = await interaction.guild.channels.fetch(voiceChannelId);
    if (voiceChannel) {
      return voiceChannel.name;
    }
  } catch (e) {
    console.warn('Failed to fetch voice channel:', e?.message || e);
  }
  return null;
}

function buildSubHeaderText(selectedNotificationRole) {
  if (!selectedNotificationRole) return null;

  if (selectedNotificationRole === 'everyone') {
    return '🔔 通知ロール: @everyone';
  } else if (selectedNotificationRole === 'here') {
    return '🔔 通知ロール: @here';
  } else {
    return `🔔 通知ロール: <@&${selectedNotificationRole}>`;
  }
}

function buildExtraButtonsIfNeeded(recruitDataObj) {
  const extraButtons = [];
  if (recruitDataObj?.startTime === '今から') {
    extraButtons.push(
      new ButtonBuilder().setCustomId('create_vc_pending').setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
    );
  }
  return extraButtons;
}

function buildExtraButtonsWithRecruitId(recruitDataObj, recruitId) {
  const extraButtons = [];
  if (recruitDataObj?.startTime === '今から') {
    extraButtons.push(
      new ButtonBuilder().setCustomId(`create_vc_${recruitId}`).setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
    );
  }
  return extraButtons;
}

function buildRecruitDetailsLine(recruitDataObj) {
  const startLabel = recruitDataObj?.startTime ? `🕒 ${recruitDataObj.startTime}` : null;
  const membersLabel = typeof recruitDataObj?.participants === 'number' ? `👥 ${recruitDataObj.participants}人` : null;
  const voiceLabelBase = formatVoiceLabel(recruitDataObj?.vc, recruitDataObj?.voicePlace);
  const voiceLabel = voiceLabelBase ? `🎙 ${voiceLabelBase}` : null;
  const valuesLine = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  return [labelsLine, valuesLine].filter(Boolean).join('\n');
}

function buildRecruitContentText(recruitDataObj) {
  return recruitDataObj?.content && String(recruitDataObj.content).trim().length > 0
    ? `**📝 募集内容**\n${String(recruitDataObj.content).slice(0,1500)}`
    : '';
}

function buildRecruitTitleText(recruitDataObj) {
  return recruitDataObj?.title ? `## ${String(recruitDataObj.title).slice(0,200)}` : '';
}

async function buildSimpleStyleContainer({ recruitDataObj, user, participantText, subHeaderText, interaction, accentColor, recruitIdText }) {
  const detailsText = buildRecruitDetailsLine(recruitDataObj);
  const contentText = buildRecruitContentText(recruitDataObj);
  const titleText = buildRecruitTitleText(recruitDataObj);
  const avatarUrl = await fetchUserAvatar(interaction);
  const extraButtons = buildExtraButtonsIfNeeded(recruitDataObj);

  return buildContainerSimple({
    headerTitle: `${user.username}さんの募集`,
    detailsText,
    contentText,
    titleText,
    participantText,
    recruitIdText,
    accentColor,
    subHeaderText,
    avatarUrl,
    extraActionButtons: extraButtons
  });
}

function buildImageStyleContainer({ user, participantText, subHeaderText, interaction, accentColor, recruitIdText, recruitDataObj }) {
  const extraButtons = buildExtraButtonsIfNeeded(recruitDataObj);

  return buildContainer({
    headerTitle: `${user.username}さんの募集`,
    subHeaderText,
    contentText: '',
    titleText: '',
    participantText,
    recruitIdText,
    accentColor,
    imageAttachmentName: 'attachment://recruit-card.png',
    recruiterId: interaction.user.id,
    requesterId: interaction.user.id,
    extraActionButtons: extraButtons
  });
}

async function sendAnnouncementsWithErrorHandling({ interaction, selectedNotificationRole, configuredNotificationRoleIds, image, container, guildSettings, user }) {
  try {
    const announceRes = await sendAnnouncements({
      interaction,
      selectedNotificationRole,
      configuredIds: configuredNotificationRoleIds,
      image,
      container,
      guildSettings
    });
    return {
      followUpMessage: announceRes.mainMessage,
      secondaryMessage: announceRes.secondaryMessage
    };
  } catch (e) {
    logError('[handleRecruitCreateModal] sendAnnouncements failed', e);

    if (isPermissionError(e)) {
      try {
        await handlePermissionError(user, e, {
          commandName: 'rect',
          channelName: interaction.channel.name
        });
      } catch (dmErr) {
        logCriticalError('[handleRecruitCreateModal] Failed to send permission error DM', dmErr);
      }
    }
    throw e;
  }
}

function buildSimpleStyleLabels(recruitDataObj) {
  const startLabel = recruitDataObj?.startTime ? `🕒 ${recruitDataObj.startTime}` : null;
  const membersLabel = typeof recruitDataObj?.participants === 'number' ? `👥 ${recruitDataObj.participants}人` : null;
  const voiceLabelBase = formatVoiceLabel(recruitDataObj?.vc, recruitDataObj?.voicePlace);
  const voiceLabel = voiceLabelBase ? `🎙 ${voiceLabelBase}` : null;

  const valuesLine = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';

  return [labelsLine, valuesLine].filter(Boolean).join('\n');
}

function buildSimpleStyleContent(recruitDataObj) {
  if (!recruitDataObj?.content || String(recruitDataObj.content).trim().length === 0) {
    return '';
  }
  return `**📝 募集内容**\n${String(recruitDataObj.content).slice(0,1500)}`;
}

function buildSimpleStyleTitle(recruitDataObj) {
  return recruitDataObj?.title ? `## ${String(recruitDataObj.title).slice(0,200)}` : '';
}

async function fetchUserAvatar(interaction) {
  try {
    const fetchedUser = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
    if (fetchedUser && typeof fetchedUser.displayAvatarURL === 'function') {
      return fetchedUser.displayAvatarURL({ size: 128, extension: 'png' });
    }
  } catch (_) {}
  return null;
}

async function buildSimpleStyleImmediateContainer({ recruitDataObj, user, participantText, subHeaderText, recruitId, accentColorInit, interaction }) {
  const detailsText = buildSimpleStyleLabels(recruitDataObj);
  const contentText = buildSimpleStyleContent(recruitDataObj);
  const titleText = buildSimpleStyleTitle(recruitDataObj);
  const avatarUrl = await fetchUserAvatar(interaction);
  const extraButtonsImmediate = buildExtraButtonsWithRecruitId(recruitDataObj, recruitId);

  return buildContainerSimple({
    headerTitle: `${user.username}さんの募集`,
    detailsText,
    contentText,
    titleText,
    participantText,
    recruitIdText: recruitId,
    accentColor: accentColorInit,
    subHeaderText,
    avatarUrl,
    extraActionButtons: extraButtonsImmediate
  });
}

function buildImageStyleImmediateContainer({ user, participantText, subHeaderText, recruitId, accentColorInit, interaction, recruitDataObj }) {
  const extraButtonsImmediate = buildExtraButtonsWithRecruitId(recruitDataObj, recruitId);
  return buildContainer({
    headerTitle: `${user.username}さんの募集`,
    subHeaderText,
    contentText: '',
    titleText: '',
    participantText,
    recruitIdText: recruitId,
    accentColor: accentColorInit,
    imageAttachmentName: 'attachment://recruit-card.png',
    recruiterId: interaction.user.id,
    requesterId: interaction.user.id,
    extraActionButtons: extraButtonsImmediate
  });
}

async function buildImmediateContainer({ style, recruitDataObj, user, participantText, subHeaderText, recruitId, accentColorInit, interaction }) {
  if (style === 'simple') {
    return await buildSimpleStyleImmediateContainer({ recruitDataObj, user, participantText, subHeaderText, recruitId, accentColorInit, interaction });
  }
  return buildImageStyleImmediateContainer({ user, participantText, subHeaderText, recruitId, accentColorInit, interaction, recruitDataObj });
}

function prepareEditPayload(immediateContainer, container, style, image) {
  const editPayload = {
    components: [immediateContainer],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  };

  if (container.__addPendingButton && container.__pendingButtonRow) {
    editPayload.components.push(container.__pendingButtonRow);
  }

  if (style === 'image' && image) {
    editPayload.files = [image];
  }

  return editPayload;
}

function prepareSecondaryPayload(immediateContainer, container, editPayload) {
  const secondaryPayload = { ...editPayload };
  secondaryPayload.components = [immediateContainer];

  if (container.__addPendingButton && container.__pendingButtonRow) {
    secondaryPayload.components.push(container.__pendingButtonRow);
  }

  return secondaryPayload;
}

async function updateMessagesWithRecruitId({ followUpMessage, secondaryMessage, immediateContainer, container, style, image }) {
  const editPayload = prepareEditPayload(immediateContainer, container, style, image);

  await followUpMessage.edit(editPayload);

  if (secondaryMessage && secondaryMessage.id) {
    const secondaryPayload = prepareSecondaryPayload(immediateContainer, container, editPayload);
    await secondaryMessage.edit(secondaryPayload);
  }
}

async function sendAndUpdateInitialMessage({
  interaction, selectedNotificationRole, configuredNotificationRoleIds, image,
  container, guildSettings, user, recruitDataObj, style, panelColor,
  participantText, subHeaderText
}) {
  const { followUpMessage, secondaryMessage } = await sendAnnouncementsWithErrorHandling({
    interaction,
    selectedNotificationRole,
    configuredNotificationRoleIds,
    image,
    container,
    guildSettings,
    user
  });

  const colorData = calculateRecruitIdAndColors(followUpMessage, panelColor, guildSettings);
  if (!colorData) return null;

  const { recruitId, accentColorInit } = colorData;

  try {
    const immediateContainer = await buildImmediateContainer({
      style,
      recruitDataObj,
      user,
      participantText,
      subHeaderText,
      recruitId,
      accentColorInit,
      interaction
    });

    await updateRecruitMessages(followUpMessage, secondaryMessage, immediateContainer, container, style, image);
  } catch (e) {
    logError('[handleRecruitCreateModal] Initial message edit failed', e);
  }

  return { followUpMessage, secondaryMessage };
}

function calculateRecruitIdAndColors(followUpMessage, panelColor, guildSettings) {
  const msgId = followUpMessage?.id;
  if (!msgId) return null;
  
  const recruitId = msgId.slice(-8);
  const useColorInit = normalizeHex(panelColor ? panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000'), '000000');
  const accentColorInit = /^[0-9A-Fa-f]{6}$/.test(useColorInit) ? parseInt(useColorInit, 16) : 0x000000;
  
  return { recruitId, accentColorInit };
}

async function updateRecruitMessages(followUpMessage, secondaryMessage, immediateContainer, container, style, image) {
  await updateMessagesWithRecruitId({
    followUpMessage,
    secondaryMessage,
    immediateContainer,
    container,
    style,
    image
  });
}

function extractRecruitTitle(pendingData) {
  const templateTitle = pendingData?.template?.title;
  if (pendingData?.title && pendingData.title.trim().length > 0) return pendingData.title;
  if (typeof templateTitle === 'string' && templateTitle.trim().length > 0) return templateTitle;
  return '参加者募集';
}

function resolveParticipantsCount(participantsNum, pendingData) {
  const templateMembers = Number(pendingData?.template?.participants || 0) || 0;
  return participantsNum || pendingData?.participants || templateMembers || 1;
}

function resolvePanelColorWithTemplate(panelColor, pendingData) {
  const templateColor = pendingData?.template?.color;
  if (panelColor && String(panelColor).trim()) return panelColor;
  if (templateColor && String(templateColor).trim()) return String(templateColor).trim();
  return panelColor;
}

function buildRecruitDataObject({ interaction, pendingData, participantsNum, panelColor, selectedNotificationRole, voiceChannelName }) {
  const modalContent = interaction.fields.getTextInputValue('content');
  const template = pendingData?.template || null;
  return {
    title: extractRecruitTitle(pendingData),
    content: modalContent || template?.content || '',
    participants: resolveParticipantsCount(participantsNum, pendingData),
    startTime: pendingData?.startTime || template?.start_time_text || '',
    vc: pendingData?.voice || template?.voice_option || '',
    voicePlace: pendingData?.voicePlace || template?.voice_place,
    voiceChannelId: pendingData?.voiceChannelId,
    voiceChannelName: voiceChannelName,
    recruiterId: interaction.user.id,
    recruitId: '',
    panelColor: resolvePanelColorWithTemplate(panelColor, pendingData),
    notificationRoleId: selectedNotificationRole,
    template: template,
    templateName: pendingData?.templateName || null,
    // テンプレートのメタデータを明示的に含める
    template_data: template ? {
      layout_json: template.layout_json || null,
      text_color: template.text_color || null,
      background_image_url: template.background_image_url || null,
      background_asset_key: template.background_asset_key || null
    } : null,
    metadata: {
      forceTemplateMode: Boolean(template),
      template: template,
      raw: {
        text_color: template?.text_color || null,
        layout_json: template?.layout_json || null
      }
    }
  };
}

function buildCurrentParticipants(interaction, existingMembers) {
  return [interaction.user.id, ...existingMembers.filter(id => id !== interaction.user.id)];
}

function buildParticipantText(currentParticipants, participantsNum) {
  const remainingSlots = participantsNum - currentParticipants.length;
  let participantText = `**📋 参加リスト** \`(あと${remainingSlots}人)\`\n`;
  participantText += currentParticipants.map(id => `<@${id}>`).join(' • ');
  return participantText;
}

function calculateAccentColor(panelColor, guildSettings) {
  const panelColorForAccent = normalizeHex(panelColor, guildSettings.defaultColor && /^[0-9A-Fa-f]{6}$/.test(guildSettings.defaultColor) ? guildSettings.defaultColor : '000000');
  return /^[0-9A-Fa-f]{6}$/.test(panelColorForAccent) ? parseInt(panelColorForAccent, 16) : 0x000000;
}

async function generateRecruitImage(style, recruitDataObj, currentParticipants, client, useColor) {
  if (style !== 'image') return null;
  // デバッグ: テンプレートデータの確認
  const hasTemplate = !!recruitDataObj?.template;
  const hasLayoutJson = !!recruitDataObj?.template_data?.layout_json;
  const hasTextColor = !!recruitDataObj?.template_data?.text_color;
  console.log('[generateRecruitImage] template info:', { hasTemplate, hasLayoutJson, hasTextColor, templateName: recruitDataObj?.templateName });
  const buffer = await generateRecruitCardQueued(recruitDataObj, currentParticipants, client, useColor);
  return new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
}

async function buildRecruitContainer(style, containerData) {
  if (style === 'simple') {
    return await buildSimpleStyleContainer(containerData);
  } else {
    return buildImageStyleContainer(containerData);
  }
}

async function handleRecruitModalError(interaction, error) {
  logCriticalError('[handleRecruitCreateModal] error', error);

  if (isUnknownInteractionError(error)) return;

  if (!interaction.replied && !interaction.deferred) {
    try {
      await replyEphemeral(interaction, {
        content: `モーダル送信エラー: ${error.message || error}`
      });
    } catch (e) {
      logCriticalError('二重応答防止: safeReply failed', e);
    }
  } else {
    try {
      await interaction.editReply({ content: `❌ モーダル送信エラー: ${error.message || error}` });
    } catch (e) {
      logCriticalError('editReply failed', e);
    }
  }
}

async function validateAndPrepareRecruitCreation(interaction) {
  const guildSettings = await getGuildSettings(interaction.guildId);
  const premiumByGuild = isPremiumEnabled(guildSettings);
  const premiumBySubscription = premiumByGuild
    ? false
    : await hasPremiumSubscription(interaction.user?.id, interaction.guildId);
  const premiumEnabled = premiumByGuild || premiumBySubscription;

  if (!(await enforceCooldown(interaction, premiumEnabled))) return null;
  if (!(await ensureNoActiveRecruit(interaction, guildSettings, premiumEnabled))) return null;
  const participantsNum = parseParticipantsNumFromModal(interaction);

  if (participantsNum === null) {
    await replyEphemeral(interaction, {
      embeds: [createErrorEmbed('参加人数は1〜16の数字で入力してください。', '入力エラー')]
    });
    return null;
  }

  return { guildSettings, participantsNum, premiumEnabled };
}

async function gatherRecruitmentInputs(interaction, guildSettings) {
  const panelColor = resolvePanelColor(interaction, guildSettings);
  const existingMembers = resolveExistingMembers(interaction);
  const selectedNotificationRole = resolveNotificationRole(interaction);
  const pendingData = pendingModalOptions.get(interaction.user.id) || {};

  if (pendingData?.templateName) {
    try {
      const template = await getTemplateByName(interaction.guildId, pendingData.templateName);
      if (template) pendingData.template = template;
    } catch (e) {
      logError('[recruit-create] template load failed', e);
    }
  }

  const voiceChannelName = await resolveVoiceChannelName(interaction, pendingData?.voiceChannelId);

  return {
    panelColor,
    existingMembers,
    selectedNotificationRole,
    pendingData,
    voiceChannelName
  };
}

async function prepareRecruitmentUI({ interaction, guildSettings, recruitDataObj, currentParticipants, participantText, selectedNotificationRole, panelColor }) {
  const useColor = normalizeHex(panelColor ? panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000'), '000000');
  const user = interaction.targetUser || interaction.user;
  const style = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
  const image = await generateRecruitImage(style, recruitDataObj, currentParticipants, interaction.client, useColor);
  const subHeaderText = buildSubHeaderText(selectedNotificationRole);
  const accentColor = calculateAccentColor(panelColor, guildSettings);
  const configuredNotificationRoleIds = buildConfiguredNotificationRoleIds(guildSettings);

  const containerData = {
    recruitDataObj,
    user,
    participantText,
    subHeaderText,
    interaction,
    accentColor,
    recruitIdText: '(作成中)'
  };

  const container = await buildRecruitContainer(style, containerData);

  return {
    image,
    container,
    user,
    style,
    subHeaderText,
    configuredNotificationRoleIds
  };
}

async function cleanupModalInteraction(interaction) {
  try {
    await interaction.deleteReply();
  } catch (e) {
    logError('[handleRecruitCreateModal] Failed to delete deferred reply', e);
  }
}

async function handleRecruitCreateModal(interaction) {
  try {
    const validation = await validateAndPrepareRecruitCreation(interaction);
    if (!validation) return;

    const { guildSettings, participantsNum, premiumEnabled } = validation;
    const inputs = await gatherRecruitmentInputs(interaction, guildSettings);
    const { panelColor, existingMembers, selectedNotificationRole, pendingData, voiceChannelName } = inputs;

    const recruitDataObj = buildRecruitDataObject({
      interaction,
      pendingData,
      participantsNum,
      panelColor,
      selectedNotificationRole,
      voiceChannelName
    });

    if (interaction.user && interaction.user.id) {
      pendingModalOptions.delete(interaction.user.id);
    }

    const currentParticipants = buildCurrentParticipants(interaction, existingMembers);
    const participantText = buildParticipantText(currentParticipants, participantsNum);

    const uiData = await prepareRecruitmentUI({
      interaction,
      guildSettings,
      recruitDataObj,
      currentParticipants,
      participantText,
      selectedNotificationRole,
      panelColor
    });

    const { image, container, user, style, subHeaderText, configuredNotificationRoleIds } = uiData;

    const result = await sendAndUpdateInitialMessage({
      interaction, selectedNotificationRole, configuredNotificationRoleIds, image,
      container, guildSettings, user, recruitDataObj, style, panelColor,
      participantText, subHeaderText
    });

    if (!result) return;

    const { followUpMessage } = result;

    try {
      await finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, premiumEnabled, user, participantText, subHeaderText, followUpMessage, currentParticipants });
    } catch (error) {
      logCriticalError('メッセージ取得エラー', error);
    }

    await cleanupModalInteraction(interaction);
  } catch (error) {
    await handleRecruitModalError(interaction, error);
  }
}

function isRecruitModal(interaction) {
  return interaction.customId === 'recruitModal';
}

function resolveModalHandler(interaction) {
  if (isRecruitModal(interaction)) {
    return handleRecruitCreateModal;
  }
  return null;
}

async function handleModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const handler = resolveModalHandler(interaction);
  if (!handler) {
    return;
  }

  await handler(interaction);
}

module.exports = {
  handleModalSubmit
};
