const { MessageFlags, EmbedBuilder, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, AttachmentBuilder, UserSelectMenuBuilder, PermissionsBitField, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recruitParticipants, pendingModalOptions } = require('./state');
const { safeReply } = require('../../utils/safeReply');
const { createErrorEmbed, createSuccessEmbed, createWarningEmbed } = require('../../utils/embedHelpers');
const { getGuildSettings, listRecruitsFromRedis, saveRecruitmentData, updateRecruitmentStatus, deleteRecruitmentData, saveRecruitToRedis, getRecruitFromRedis, saveParticipantsToRedis, getParticipantsFromRedis, deleteParticipantsFromRedis, pushRecruitToWebAPI, getCooldownRemaining, setCooldown } = require('../../utils/db');
const { buildContainer } = require('../../utils/recruitHelpers');
const { generateRecruitCard } = require('../../utils/canvasRecruit');
const { updateParticipantList, autoCloseRecruitment } = require('../../utils/recruitMessage');
const { EXEMPT_GUILD_IDS } = require('./constants');
const { handlePermissionError } = require('../../utils/handlePermissionError');
const { sendNotificationAsync, formatVoiceLabel, fetchUserAvatarUrl, formatParticipantList, runInBackground } = require('./handlerUtils');
const { replyEphemeral, logError, logWarning, logCriticalError } = require('./reply-helpers');
const { isValidParticipantsNumber, isValidStartDelay, isImmediateStartTime, isValidHexColor, hasNotificationRole, hasVoiceChat, hasVoiceChannelId, isRecruiter, hasValidParticipants, shouldUseDefaultNotification: shouldUseDefaultNotif, isDifferentChannel, isPermissionError, isUnknownInteractionError } = require('./validation-helpers');
const { hexToIntColor, buildStartTimeNotificationEmbed, buildStartTimeNotificationComponents, buildTextComponent, buildSeparatorComponent, buildMediaGalleryComponent, addComponentToContainer, buildContainerFromLayout } = require('./ui-builders');

// ------------------------------
// Helper utilities (behavior-preserving refactor)
// ------------------------------

const eightHoursMs = 8 * 60 * 60 * 1000;

function computeDelayMs(targetTime, now = null) {
  if (!targetTime) return null;
  const target = new Date(targetTime).getTime();
  const current = now ? new Date(now).getTime() : Date.now();
  return target - current;
}

// 満員DMの重複送信防止
const fullNotifySent = new Set();

// 開始時刻通知の重複送信防止
const startNotifySent = new Set();

function isGuildExempt(guildId) {
  return EXEMPT_GUILD_IDS.has(String(guildId));
}

async function enforceCooldown(interaction) {
  try {
    if (isGuildExempt(interaction.guildId)) return true;
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

async function ensureNoActiveRecruit(interaction) {
  if (isGuildExempt(interaction.guildId)) return true;
  try {
    const allRecruits = await listRecruitsFromRedis();
    const guildIdStr = String(interaction.guildId);
    if (Array.isArray(allRecruits)) {
      const matched = allRecruits.filter(r => {
        const gid = String(r?.guildId ?? r?.guild_id ?? r?.guild ?? r?.metadata?.guildId ?? r?.metadata?.guild ?? '');
        const status = String(r?.status ?? '').toLowerCase();
        return gid === guildIdStr && (status === 'recruiting' || status === 'active');
      });
      if (matched.length >= 3) {
        await replyEphemeral(interaction, { 
          embeds: [createErrorEmbed('このサーバーでは同時に実行できる募集は3件までです。\n既存の募集をいくつか締め切ってから新しい募集を作成してください。', '募集上限到達')] 
        });
        return false;
      }
    }
    return true;
  } catch (e) {
    logError('listRecruitsFromRedis failed', e);
    return true; // フェイルオープン（既存挙動と同等の寛容さ）
  }
}

function parseParticipantsNumFromModal(interaction) {
  // pendingModalOptionsから取得
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

function buildConfiguredNotificationRoleIds(guildSettings) {
  const roles = [];
  if (Array.isArray(guildSettings.notification_roles)) roles.push(...guildSettings.notification_roles.filter(Boolean));
  if (guildSettings.notification_role) roles.push(guildSettings.notification_role);
  return [...new Set(roles.map(String))].slice(0, 25);
}

async function fetchValidNotificationRoles(interaction, configuredIds) {
  const valid = [];
  for (const roleId of configuredIds) {
    let role = interaction.guild?.roles?.cache?.get(roleId) || null;
    if (!role) role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (role) valid.push({ id: role.id, name: role.name });
  }
  return valid;
}

async function selectNotificationRole(interaction, configuredIds) {
  // 事前選択（pending）
  try {
    const pending = interaction.user && interaction.user.id ? pendingModalOptions.get(interaction.user.id) : null;
    const preSelected = pending && pending.notificationRoleId ? String(pending.notificationRoleId) : null;
    if (preSelected) {
      if (configuredIds.includes(preSelected)) {
        pendingModalOptions.delete(interaction.user.id);
        return { roleId: preSelected, aborted: false };
      } else {
        await safeReply(interaction, { content: '❌ 指定された通知ロールは使用できません（設定に含まれていません）。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
        return { roleId: null, aborted: true };
      }
    }
  } catch (e) {
    console.warn('pendingModalOptions (notificationRoleId) read failed:', e?.message || e);
  }

  const valid = await fetchValidNotificationRoles(interaction, configuredIds);
  if (valid.length === 0) return { roleId: null, aborted: false };
  if (valid.length === 1) return { roleId: valid[0].id, aborted: false };

  // 複数有効なロールがある場合、選択 UI を提示
  const options = valid.slice(0, 24).map(role => new StringSelectMenuOptionBuilder().setLabel(role.name?.slice(0, 100) || '通知ロール').setValue(role.id));
  options.push(new StringSelectMenuOptionBuilder().setLabel('通知ロールなし').setValue('none').setDescription('今回は通知ロールを使用せずに募集します。'));
  const selectMenu = new StringSelectMenuBuilder().setCustomId(`recruit_notification_role_select_${interaction.id}`).setPlaceholder('通知ロールを選択してください').setMinValues(1).setMaxValues(1).addOptions(options);
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const promptMessage = await safeReply(interaction, { content: '🔔 通知ロールを選択してください（任意）', components: [selectRow], flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
  if (!promptMessage || typeof promptMessage.awaitMessageComponent !== 'function') {
    return { roleId: valid[0]?.id || null, aborted: false };
  }
  try {
    const selectInteraction = await promptMessage.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 60_000, filter: (i) => i.user.id === interaction.user.id });
    const choice = selectInteraction.values[0];
    const selected = choice === 'none' ? null : choice;
    const confirmationText = selected ? `🔔 通知ロール: <@&${selected}>` : '🔕 通知ロールを使用せずに募集を作成します。';
    await selectInteraction.update({ content: confirmationText, components: [], allowedMentions: { roles: [], users: [] } });
    return { roleId: selected, aborted: false };
  } catch (collectorError) {
    console.warn('[handleModalSubmit] Notification role selection timed out:', collectorError?.message || collectorError);
    await promptMessage.edit({ content: '⏱ 通知ロールの選択がタイムアウトしました。募集は作成されませんでした。', components: [] }).catch(() => {});
    return { roleId: null, aborted: true };
  }
}

/**
 * Sends notification to a channel (primary or recruitment channel)
 */
async function sendChannelNotification(channel, notificationRole, shouldUseDefaultNotification, logContext) {
  const roleToUse = notificationRole || (shouldUseDefaultNotification ? '1416797165769986161' : null);
  if (roleToUse) {
    runInBackground(
      () => sendNotificationAsync(channel, roleToUse, '新しい募集が作成されました。', logContext),
      `通知送信 ${logContext}`
    );
  }
}

/**
 * Posts recruitment message to a channel with components
 */
async function postRecruitmentMessage(channel, container, image, extraComponents) {
  const options = { 
    components: [container], 
    flags: MessageFlags.IsComponentsV2, 
    allowedMentions: { roles: [], users: [] }
  };
  
  if (image) options.files = [image];
  if (Array.isArray(extraComponents) && extraComponents.length > 0) {
    options.components.push(...extraComponents);
  }
  
  return await channel.send(options);
}

async function sendAnnouncements(interaction, selectedNotificationRole, configuredIds, image, container, guildSettings, user, extraComponents = []) {
  const shouldUseDefaultNotification = shouldUseDefaultNotif(selectedNotificationRole, configuredIds);
  
  // Send notification to primary channel
  await sendChannelNotification(
    interaction.channel, 
    selectedNotificationRole, 
    shouldUseDefaultNotification,
    '(primary channel)'
  );

  // Post recruitment message to primary channel
  const followUpMessage = await postRecruitmentMessage(
    interaction.channel, 
    container, 
    image, 
    extraComponents
  );
  let secondaryMessage = null;

  // Post to recruitment channel if different from primary
  const primaryRecruitChannelId = Array.isArray(guildSettings.recruit_channels) && guildSettings.recruit_channels.length > 0
    ? guildSettings.recruit_channels[0]
    : guildSettings.recruit_channel;

  if (isDifferentChannel(primaryRecruitChannelId, interaction.channelId)) {
    try {
      const recruitChannel = await interaction.guild.channels.fetch(primaryRecruitChannelId);
      if (recruitChannel && recruitChannel.isTextBased()) {
        // Send notification to recruitment channel
        await sendChannelNotification(
          recruitChannel, 
          selectedNotificationRole, 
          shouldUseDefaultNotification,
          '(recruit channel)'
        );
        
        // Post recruitment message to recruitment channel
        try {
          secondaryMessage = await postRecruitmentMessage(
            recruitChannel, 
            container, 
            image, 
            extraComponents
          );
        } catch (e) { 
          logError('募集メッセージ送信失敗(指定ch)', e); 
        }
      }
    } catch (channelError) { 
      logCriticalError('指定チャンネルへの送信でエラー', channelError); 
    }
  }

  return { mainMessage: followUpMessage, secondaryMessage };
}

/**
 * Generates a unique recruitment ID from message ID
 */
function generateRecruitId(messageId) {
  return messageId.slice(-8);
}

/**
 * Prepares final recruitment data with all required fields
 */
function prepareFinalRecruitData(recruitDataObj, actualRecruitId, interaction, actualMessageId) {
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

/**
 * Persists recruitment data to Redis and Web API
 */
async function persistRecruitmentData(finalRecruitData, interaction, actualMessageId, actualRecruitId) {
  try {
    await saveRecruitToRedis(actualRecruitId, finalRecruitData);
    const pushRes = await pushRecruitToWebAPI(finalRecruitData);
    if (!pushRes || !pushRes.ok) console.error('Worker API push failed:', pushRes);
    
    try {
      const workerSave = await saveRecruitmentData(
        interaction.guildId, 
        interaction.channelId, 
        actualMessageId, 
        interaction.guild?.name, 
        interaction.channel?.name, 
        finalRecruitData
      );
      if (!workerSave?.ok) console.error('[worker-sync] DO 保存失敗:', workerSave);
    } catch (saveErr) { 
      console.error('[worker-sync] saveRecruitmentData error:', saveErr?.message || saveErr); 
    }
  } catch (err) { 
    console.error('Redis保存またはAPI pushエラー:', err); 
  }
}

/**
 * Sends webhook notification for new recruitment
 */
async function sendWebhookNotification(finalRecruitData, interaction, actualMessageId, avatarUrl) {
  try {
    const webhookUrl = 'https://discord.com/api/webhooks/1426044588740710460/RElua00Jvi-937tbGtwv9wfq123mdff097HvaJgb-qILNsc79yzei9x8vZrM2OKYsETI';
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
    console.error('[webhook] 募集通知の送信に失敗:', webhookErr?.message || webhookErr);
  }
}


/**
 * Updates recruitment message with final ID and generated image
 */
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
    const updatedImageBuffer = await generateRecruitCard(
      finalRecruitData, 
      currentParticipants, 
      interaction.client, 
      finalUseColor
    );
    updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });
  }
  
  const finalAccentColor = /^[0-9A-Fa-f]{6}$/.test(finalUseColor) ? parseInt(finalUseColor, 16) : 0x000000;
  let updatedContainer;
  
  if (styleForEdit === 'simple') {
    const { buildContainerSimple } = require('../../utils/recruitHelpers');
    const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
    const startVal = finalRecruitData?.startTime ? String(finalRecruitData.startTime) : null;
    const membersVal = typeof finalRecruitData?.participants === 'number' ? `${finalRecruitData.participants}人` : null;
    const voiceVal = formatVoiceLabel(finalRecruitData?.vc, finalRecruitData?.voicePlace);
    const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
    const detailsText = `${labelsLine}\n${valuesLine}`;
    
    const contentTextValue = finalRecruitData?.content || finalRecruitData?.note || finalRecruitData?.description || '';
    const contentText = contentTextValue && String(contentTextValue).trim().length > 0 
      ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}` 
      : '';
    
    const extraButtonsFinalSimple = [];
    if (finalRecruitData?.startTime === '今から') {
      const { ButtonBuilder, ButtonStyle } = require('discord.js');
      extraButtonsFinalSimple.push(
        new ButtonBuilder()
          .setCustomId(`create_vc_${actualRecruitId}`)
          .setLabel('専用チャンネル作成')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    updatedContainer = buildContainerSimple({
      headerTitle: `${user.username}さんの募集`,
      detailsText,
      contentText,
      titleText: finalRecruitData?.title ? `## ${String(finalRecruitData.title).slice(0,200)}` : '',
      participantText,
      recruitIdText: actualRecruitId,
      accentColor: finalAccentColor,
      subHeaderText,
      avatarUrl,
      extraActionButtons: extraButtonsFinalSimple
    });
  } else {
    const { buildContainer } = require('../../utils/recruitHelpers');
    const contentTextValue = finalRecruitData?.content || finalRecruitData?.note || finalRecruitData?.description || '';
    const contentText = contentTextValue && String(contentTextValue).trim().length > 0 
      ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}` 
      : '';
    
    const extraButtonsFinalImg = [];
    if (finalRecruitData?.startTime === '今から') {
      const { ButtonBuilder, ButtonStyle } = require('discord.js');
      extraButtonsFinalImg.push(
        new ButtonBuilder()
          .setCustomId(`create_vc_${actualRecruitId}`)
          .setLabel('専用チャンネル作成')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    updatedContainer = buildContainer({
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
      extraActionButtons: extraButtonsFinalImg
    });
  }
  
  try {
    const editPayload = { 
      components: [updatedContainer], 
      flags: MessageFlags.IsComponentsV2, 
      allowedMentions: { roles: [], users: [] } 
    };
    if (updatedImage) editPayload.files = [updatedImage];
    await actualMessage.edit(editPayload);
  } catch (editError) { 
    console.error('メッセージ更新エラー:', editError?.message || editError); 
  }
}

async function finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, user, participantText, subHeaderText, followUpMessage, currentParticipants }) {
  const actualMessage = followUpMessage;
  const actualMessageId = actualMessage.id;
  const actualRecruitId = generateRecruitId(actualMessageId);
  
  // Prepare final recruitment data
  const finalRecruitData = prepareFinalRecruitData(recruitDataObj, actualRecruitId, interaction, actualMessageId);

  // Fetch avatar URL for display
  const avatarUrl = await fetchUserAvatarUrl(interaction.client, interaction.user.id);

  // Persist data to Redis and Web API
  await persistRecruitmentData(finalRecruitData, interaction, actualMessageId, actualRecruitId);
  
  // Send webhook notification
  await sendWebhookNotification(finalRecruitData, interaction, actualMessageId, avatarUrl);

  // Save participants
  recruitParticipants.set(actualMessageId, currentParticipants);
  try { 
    await saveParticipantsToRedis(actualMessageId, currentParticipants); 
  } catch (e) { 
    console.warn('初期参加者のRedis保存に失敗:', e?.message || e); 
  }

  // Update message with final ID and image
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

  // Schedule start time notification
  scheduleStartTimeNotification(finalRecruitData, interaction, actualMessageId, actualRecruitId, guildSettings);

  // Set cooldown
  try { 
    if (!isGuildExempt(interaction.guildId)) {
      await setCooldown(`rect:${interaction.guildId}`, 60); 
    }
  } catch (e) { 
    console.warn('[rect cooldown set at submit] failed:', e?.message || e); 
  }
}

/**
 * Schedules a notification for recruitment start time
 */
async function sendStartTimeNotification(context) {
  const { finalRecruitData, interaction, actualMessageId, actualRecruitId, ids } = context;
  
  const mentions = ids.map(id => `<@${id}>`).join(' ');
  const embed = buildStartTimeNotificationEmbed({ 
    finalRecruitData, 
    mentions, 
    interaction, 
    actualMessageId 
  });
  const components = buildStartTimeNotificationComponents({ 
    guildSettings: context.guildSettings, 
    actualRecruitId 
  });
  
  const sendOptions = { 
    content: mentions, 
    embeds: [embed], 
    components,
    allowedMentions: { users: ids } 
  };
  
  await interaction.channel.send(sendOptions).catch(() => {});
}

async function tryGetParticipants(actualMessageId) {
  const fromRedis = await getParticipantsFromRedis(actualMessageId).catch(() => null);
  if (fromRedis) return fromRedis;
  
  const fromMemory = recruitParticipants.get(actualMessageId);
  if (fromMemory) return fromMemory;
  
  return [];
}

function scheduleStartTimeNotification(finalRecruitData, interaction, actualMessageId, actualRecruitId, guildSettings) {
  if (isImmediateStartTime(finalRecruitData.startTime)) return;
  
  const startDelay = computeDelayMs(finalRecruitData.startAt, null);
  if (!isValidStartDelay(startDelay)) return;
  
  setTimeout(async () => {
    try {
      // Prevent duplicate notifications
      if (startNotifySent.has(actualRecruitId)) return;
      startNotifySent.add(actualRecruitId);
      
      if (!recruitParticipants.has(actualMessageId)) return; // Already closed
      
      const ids = await tryGetParticipants(actualMessageId);
      if (!hasValidParticipants(ids)) return;
      
      await sendStartTimeNotification({ 
        finalRecruitData, 
        interaction, 
        actualMessageId, 
        actualRecruitId, 
        ids, 
        guildSettings 
      });
    } catch (e) {
      logError('開始通知送信失敗', e);
    }
  }, startDelay);
}

// ------------------------------
// Extracted helpers for button handling
// ------------------------------

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
 * Sends a notification to the recruitment channel about a new participant
 */
async function sendJoinNotificationToChannel(interaction, messageId, savedRecruitData) {
  if (!savedRecruitData?.recruiterId || !savedRecruitData?.channelId) return;
  
  runInBackground(async () => {
    const { getDedicatedChannel } = require('../../utils/db/dedicatedChannels');
    const recruitId = savedRecruitData.recruitId || messageId.slice(-8);
    const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);
    
    const channel = await interaction.client.channels.fetch(savedRecruitData.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    
    let notificationContent = `🎉 <@${interaction.user.id}> が参加しました！`;
    if (dedicatedChannelId) {
      notificationContent += `\n🔗 専用チャンネル: <#${dedicatedChannelId}>`;
    }
    
    const notificationMsg = await channel.send({
      content: notificationContent,
      allowedMentions: { users: [] }
    });
    
    // Auto-delete after 5 minutes
    setTimeout(() => {
      notificationMsg.delete().catch(() => null);
    }, 5 * 60 * 1000);
  }, 'Join notification to channel');
}

/**
 * Sends a DM to the recruiter about a new participant
 */
async function notifyRecruiterOfJoin(interaction, participants, savedRecruitData) {
  if (!savedRecruitData?.recruiterId) return;
  
  runInBackground(async () => {
    const joinColor = hexToIntColor(savedRecruitData?.panelColor || '00FF00', 0x00FF00);
    const joinEmbed = new EmbedBuilder()
      .setColor(joinColor)
      .setTitle('🎮 新しい参加者がいます！')
      .setDescription(`<@${interaction.user.id}> が募集に参加しました！`)
      .addFields(
        { name: '募集タイトル', value: savedRecruitData.title, inline: false },
        { name: '現在の参加者数', value: `${participants.length}/${savedRecruitData.participants}人`, inline: true }
      )
      .setTimestamp();
    
    const recruiterUser = await interaction.client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
    if (recruiterUser && recruiterUser.send) {
      await recruiterUser.send({ 
        content: `あなたの募集に参加者が増えました: ${savedRecruitData.title || ''}`, 
        embeds: [joinEmbed] 
      }).catch(() => null);
    }
  }, 'Recruiter DM notification');
}

async function processJoin(interaction, messageId, participants, savedRecruitData) {
  // Guard: Check if already joined
  if (participants.includes(interaction.user.id)) {
    await safeReply(interaction, { 
      embeds: [createErrorEmbed('既に参加済みです。')], 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
    return;
  }
  
  // Add participant
  participants.push(interaction.user.id);
  recruitParticipants.set(messageId, participants);
  saveParticipantsToRedis(messageId, participants).catch(e => 
    console.warn('参加者保存失敗 (async):', e?.message || e)
  );
  
  // Send confirmation to user
  try {
    await safeReply(interaction, { 
      content: '✅ 参加しました！', 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
  } catch (e) {
    console.warn('quick reply failed:', e?.message || e);
  }
  
  // Send notifications in background
  await sendJoinNotificationToChannel(interaction, messageId, savedRecruitData);
  await notifyRecruiterOfJoin(interaction, participants, savedRecruitData);
  
  // Update participant list
  updateParticipantList(interaction, participants, savedRecruitData).catch(e => 
    console.warn('updateParticipantList failed (async):', e?.message || e)
  );
}

async function processCancel(interaction, messageId, participants, savedRecruitData) {
  const beforeLength = participants.length;
  if (savedRecruitData && savedRecruitData.recruiterId === interaction.user.id) {
    await safeReply(interaction, { embeds: [createErrorEmbed('募集主は参加をキャンセルできません。\n募集を締める場合は「締め」ボタンを使用してください。')], flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
    return participants;
  }
  const updated = participants.filter(id => id !== interaction.user.id);
  if (beforeLength > updated.length) {
    recruitParticipants.set(messageId, updated);
    saveParticipantsToRedis(messageId, updated).catch(e => console.warn('参加者保存失敗 (async):', e?.message || e));
    try { await safeReply(interaction, { content: '✅ 参加を取り消しました。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } }); } catch (e) { console.warn('quick cancel reply failed:', e?.message || e); }
    if (savedRecruitData && savedRecruitData.recruiterId) {
      (async () => {
        try {
          const cancelColor = hexToIntColor(savedRecruitData?.panelColor || 'FF6B35', 0xFF6B35);
          const cancelEmbed = new EmbedBuilder()
            .setColor(cancelColor)
            .setTitle('📤 参加者がキャンセルしました')
            .setDescription(`<@${interaction.user.id}> が募集から離脱しました。`)
            .addFields(
              { name: '募集タイトル', value: savedRecruitData.title, inline: false },
              { name: '現在の参加者数', value: `${updated.length}/${savedRecruitData.participants}人`, inline: true }
            )
            .setTimestamp();
          const recruiterUser = await interaction.client.users.fetch(savedRecruitData.recruiterId).catch(() => null);
          if (recruiterUser && recruiterUser.send) await recruiterUser.send({ content: `あなたの募集から参加者が離脱しました: ${savedRecruitData.title || ''}`, embeds: [cancelEmbed] }).catch(() => null);
        } catch (e) { console.warn('background cancel notify failed:', e?.message || e); }
      })();
    }
  } else {
    await safeReply(interaction, { embeds: [createErrorEmbed('参加していないため、取り消せません。')], flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
  }
  updateParticipantList(interaction, updated, savedRecruitData).catch(e => console.warn('updateParticipantList failed (async):', e?.message || e));
  return updated;
}

/**
 * Validates if the user is the recruiter
 */
function validateRecruiterPermission(interaction, data) {
  if (!data) {
    return { valid: false, error: '募集データが見つからないため締め切れません。' };
  }
  if (data.recruiterId !== interaction.user.id) {
    return { valid: false, error: '締め切りを実行できるのは募集主のみです。' };
  }
  return { valid: true };
}

/**
 * Updates recruitment status to ended
 */
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

/**
 * Deletes recruitment data from various sources
 */
async function cleanupRecruitmentData(messageId, userId, data) {
  try {
    const delRes = await deleteRecruitmentData(messageId, userId);
    if (!delRes?.ok && delRes?.status !== 404) {
      console.warn('管理API: 募集データ削除の結果が不正です:', delRes);
    }
  } catch (err) {
    console.error('募集データの削除に失敗:', err);
  }
  
  // Clean up in-memory and Redis
  recruitParticipants.delete(messageId);
  try {
    await deleteParticipantsFromRedis(messageId);
  } catch (e) {
    console.warn('Redis参加者削除失敗:', e?.message || e);
  }
  
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

/**
 * Builds the closed recruitment card based on style
 */
/**
 * Determines which layout type to use for closed recruitment
 * Note: This provides an extension point for future states (e.g., canceled, full)
 */
function resolveClosedRecruitmentLayout(recruitStyle) {
  return recruitStyle === 'image' ? 'image' : 'simple';
}

/**
 * Prepares context data for closed recruitment card building
 */
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

/**
 * Generates closed recruitment image attachment
 */
async function generateClosedImageAttachment(context) {
  const { generateClosedRecruitCard, generateRecruitCard } = require('../../utils/canvasRecruit');
  
  let baseImageBuffer = null;
  
  if (context.hasAttachment) {
    try {
      const originalAttachmentUrl = context.originalMessage.attachments.first().url;
      const response = await fetch(originalAttachmentUrl);
      const arrayBuffer = await response.arrayBuffer();
      baseImageBuffer = Buffer.from(arrayBuffer);
    } catch (imgErr) {
      console.warn('[processClose] Failed to fetch original image:', imgErr);
    }
  }
  
  if (!baseImageBuffer) {
    try {
      let useColor = context.data?.panelColor || '808080';
      if (typeof useColor === 'string' && useColor.startsWith('#')) useColor = useColor.slice(1);
      if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) useColor = '808080';
      baseImageBuffer = await generateRecruitCard(context.data, context.finalParticipants, context.interaction.client, useColor);
    } catch (imgErr) {
      console.warn('[processClose] Failed to generate base recruit image:', imgErr);
    }
  }
  
  if (baseImageBuffer) {
    try {
      const closedImageBuffer = await generateClosedRecruitCard(baseImageBuffer);
      return new AttachmentBuilder(closedImageBuffer, { name: 'recruit-card-closed.png' });
    } catch (imgErr) {
      console.warn('[processClose] Failed to generate closed image:', imgErr);
    }
  }
  
  return null;
}

/**
 * Builds image-style layout for closed recruitment
 */
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

/**
 * Builds simple text-style layout for closed recruitment
 */
function buildSimpleStyleLayout(context) {
  const components = [
    { type: 'text', content: '🔒 **募集締め切り済み**' }
  ];
  
  if (context.data?.title) {
    components.push({ type: 'text', content: `📌 タイトル\n${String(context.data.title).slice(0,200)}` });
  }
  
  components.push({ type: 'separator', spacing: 'Small', divider: true });
  
  const startLabel = context.data?.startTime ? `🕒 ${context.data.startTime}` : null;
  const membersLabel = (typeof context.totalMembers === 'number') ? `👥 ${context.totalMembers}人` : null;
  const voiceLabel = formatVoiceLabel(context.data?.vc || (context.data?.voice === true ? 'あり' : context.data?.voice === false ? 'なし' : null), context.data?.voicePlace);
  const detailsText = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
  
  if (detailsText) {
    components.push({ type: 'text', content: detailsText });
  }
  
  const contentText = context.data?.content ? `📝 募集内容\n${String(context.data.content).slice(0,1500)}` : '';
  if (contentText) {
    components.push({ type: 'text', content: contentText });
  }
  
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

/**
 * Builds Discord container from layout definition
 */
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

/**
 * Main function: builds closed recruitment card with separated concerns
 */
async function buildClosedRecruitmentCard(recruitStyle, data, messageId, interaction, originalMessage) {
  const context = prepareClosedRecruitmentContext(data, messageId, interaction, originalMessage);
  const layoutType = resolveClosedRecruitmentLayout(recruitStyle);
  
  const layout = layoutType === 'image' 
    ? await buildImageStyleLayout(context)
    : buildSimpleStyleLayout(context);
  
  const container = buildClosedCardContainer(layout);
  
  return { container, attachment: layout.attachment };
}

/**
 * Schedules deletion of dedicated channel
 */
function scheduleDedicatedChannelCleanup(interaction, data, messageId) {
  runInBackground(async () => {
    const { getDedicatedChannel, deleteDedicatedChannel } = require('../../utils/db/dedicatedChannels');
    const recruitId = data?.recruitId || String(messageId).slice(-8);
    const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);
    
    if (!dedicatedChannelId) return;
    
    // Send deletion notice
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
    
    // Schedule deletion after 5 minutes
    setTimeout(async () => {
      try {
        const channel = await interaction.guild.channels.fetch(dedicatedChannelId).catch(() => null);
        if (channel) {
          await channel.delete();
        }
        await deleteDedicatedChannel(recruitId);
      } catch (e) {
        console.warn(`[processClose] Failed to delete channel ${dedicatedChannelId}:`, e?.message || e);
      }
    }, 5 * 60 * 1000);
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

async function updateMessageWithClosedCard(interaction, messageId, recruitStyle, data) {
  const { container, attachment } = await buildClosedRecruitmentCard(
    recruitStyle, 
    data, 
    messageId, 
    interaction, 
    interaction.message
  );
  
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
    // Load recruitment data
    const data = await loadRecruitmentData(messageId, savedRecruitData);
    
    // Validate permissions
    const validation = validateRecruiterPermission(interaction, data);
    if (!validation.valid) {
      await replyEphemeral(interaction, { 
        embeds: [createErrorEmbed(validation.error, '権限エラー')] 
      });
      return;
    }
    
    // Update status and cleanup
    const statusUpdateSuccess = await updateRecruitmentStatusToEnded(messageId);
    if (statusUpdateSuccess) {
      await cleanupRecruitmentData(messageId, interaction.user.id, data);
    }
    
    // Get guild settings for style
    const recruitStyle = await getRecruitStyle(interaction.guildId);
    
    // Build and update closed card
    await updateMessageWithClosedCard(interaction, messageId, recruitStyle, data);
    
    // Send notification
    await sendCloseNotification(interaction, data, messageId);
  } catch (e) {
    logCriticalError('close button handler error', e);
  }
}

// ------------------------------
// Modal Type Predicates (Decompose Conditional)
// ------------------------------

/**
 * 募集作成モーダルかどうかを判定
 */
function isRecruitModal(interaction) {
  return interaction.customId === 'recruitModal';
}

// ------------------------------
// Modal Handler Resolver
// ------------------------------

/**
 * モーダル種別に応じた handler を返す
 */
function resolveModalHandler(interaction) {
  if (isRecruitModal(interaction)) {
    return handleRecruitCreateModal;
  }
  // 他のモーダルタイプに対応する場合は、ここに追加
  return null;
}

// ------------------------------
// Recruitment Creation Modal Handler - Extracted Helpers
// ------------------------------

/**
 * 既存参加者の取得（モーダル内のUserSelectMenuから） - botを除外
 */
function resolveExistingMembers(interaction) {
  try {
    const selectedMembers = interaction.fields.getSelectedMembers('existingMembers');
    if (selectedMembers && selectedMembers.size > 0) {
      // 募集主以外 & bot以外のメンバーを抽出
      return Array.from(selectedMembers.keys()).filter(id => {
        const member = selectedMembers.get(id);
        return id !== interaction.user.id && !(member?.user?.bot);
      });
    }
  } catch (e) {
    // no existing members selected
  }
  return [];
}

/**
 * 通知ロールの取得（モーダル内のStringSelectMenuから）
 */
function resolveNotificationRole(interaction) {
  try {
    const values = interaction.fields.getStringSelectValues('notificationRole');
    if (values && values.length > 0) {
      const roleId = values[0];
      if (roleId === 'none') {
        // 「通知なし」が選択された
        return null;
      } else if (roleId === 'everyone' || roleId === 'here') {
        // @everyone または @here が選択された
        return roleId;
      } else {
        // ロールIDが選択された（StringSelectMenuなので設定済みロールのみが選択肢）
        return roleId;
      }
    }
  } catch (e) {
    // no notification role selected
  }
  return null;
}

/**
 * 通話場所のチャンネル名を取得
 */
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

/**
 * 通知ロールをヘッダーの下（subHeaderText）に表示用テキストを生成
 */
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

/**
 * 「今から」の場合の追加ボタンを生成
 */
function buildExtraButtonsIfNeeded(recruitDataObj) {
  const extraButtons = [];
  if (recruitDataObj?.startTime === '今から') {
    extraButtons.push(
      new ButtonBuilder().setCustomId('create_vc_pending').setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
    );
  }
  return extraButtons;
}

/**
 * 「今から」の場合の追加ボタンを生成（recruitId付き）
 */
function buildExtraButtonsWithRecruitId(recruitDataObj, recruitId) {
  const extraButtons = [];
  if (recruitDataObj?.startTime === '今から') {
    extraButtons.push(
      new ButtonBuilder().setCustomId(`create_vc_${recruitId}`).setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
    );
  }
  return extraButtons;
}

/**
 * シンプルスタイルのコンテナを構築
 */
async function buildSimpleStyleContainer({ recruitDataObj, user, participantText, subHeaderText, interaction, accentColor, recruitIdText }) {
  const { buildContainerSimple } = require('../../utils/recruitHelpers');
  
  const startLabel = recruitDataObj?.startTime ? `🕒 ${recruitDataObj.startTime}` : null;
  const membersLabel = typeof recruitDataObj?.participants === 'number' ? `👥 ${recruitDataObj.participants}人` : null;
  const voiceLabelBase = formatVoiceLabel(recruitDataObj?.vc, recruitDataObj?.voicePlace);
  const voiceLabel = voiceLabelBase ? `🎙 ${voiceLabelBase}` : null;
  const valuesLine = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  const detailsText = [labelsLine, valuesLine].filter(Boolean).join('\n');
  
  // 募集内容: ユーザー入力のマークダウンを保持し、ラベルは太字で強調
  const contentText = recruitDataObj?.content && String(recruitDataObj.content).trim().length > 0 
    ? `**📝 募集内容**\n${String(recruitDataObj.content).slice(0,1500)}` 
    : '';
  
  const titleText = recruitDataObj?.title ? `## ${String(recruitDataObj.title).slice(0,200)}` : '';
  
  // 募集主のアバターURL（右上サムネイル用）: client経由でfetch
  let avatarUrl = null;
  try {
    const fetchedUser = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
    if (fetchedUser && typeof fetchedUser.displayAvatarURL === 'function') {
      avatarUrl = fetchedUser.displayAvatarURL({ size: 128, extension: 'png' });
    }
  } catch (_) {}
  
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

/**
 * 画像スタイルのコンテナを構築
 */
function buildImageStyleContainer({ user, participantText, subHeaderText, interaction, accentColor, recruitIdText, recruitDataObj }) {
  const { buildContainer } = require('../../utils/recruitHelpers');
  
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

/**
 * メッセージ送信と初期編集
 */
async function sendAndUpdateInitialMessage({ 
  interaction, selectedNotificationRole, configuredNotificationRoleIds, image, 
  container, guildSettings, user, recruitDataObj, style, panelColor, 
  participantText, subHeaderText, currentParticipants 
}) {
  // アナウンス送信
  let followUpMessage, secondaryMessage;
  try {
    const announceRes = await sendAnnouncements(interaction, selectedNotificationRole, configuredNotificationRoleIds, image, container, guildSettings, user);
    followUpMessage = announceRes.mainMessage;
    secondaryMessage = announceRes.secondaryMessage;
  } catch (e) {
    console.warn('[handleRecruitCreateModal] sendAnnouncements failed:', e?.message || e);
    
    // 権限エラーの場合はDMに通知
    if (e.code === 50001 || e.code === 50013) {
      try {
        await handlePermissionError(user, e, {
          commandName: 'rect',
          channelName: interaction.channel.name
        });
      } catch (dmErr) {
        console.error('[handleRecruitCreateModal] Failed to send permission error DM:', dmErr?.message || dmErr);
      }
    }
    throw e;
  }

  const msgId = followUpMessage?.id;
  if (!msgId) return null;

  const recruitId = msgId.slice(-8);
  const useColorInit = normalizeHex(panelColor ? panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000'), '000000');
  const accentColorInit = /^[0-9A-Fa-f]{6}$/.test(useColorInit) ? parseInt(useColorInit, 16) : 0x000000;

  try {
    let immediateContainer;
    if (style === 'simple') {
      const { buildContainerSimple } = require('../../utils/recruitHelpers');
      const startLabel = recruitDataObj?.startTime ? `🕒 ${recruitDataObj.startTime}` : null;
      const membersLabel = typeof recruitDataObj?.participants === 'number' ? `👥 ${recruitDataObj.participants}人` : null;
      const voiceLabelBase = formatVoiceLabel(recruitDataObj?.vc, recruitDataObj?.voicePlace);
      const voiceLabel = voiceLabelBase ? `🎙 ${voiceLabelBase}` : null;
      const valuesLine = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
      const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
      const detailsText = [labelsLine, valuesLine].filter(Boolean).join('\n');
      const contentText = recruitDataObj?.content && String(recruitDataObj.content).trim().length > 0
        ? `**📝 募集内容**\n${String(recruitDataObj.content).slice(0,1500)}`
        : '';
      let avatarUrl = null;
      try {
        const fetchedUser = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
        if (fetchedUser && typeof fetchedUser.displayAvatarURL === 'function') {
          avatarUrl = fetchedUser.displayAvatarURL({ size: 128, extension: 'png' });
        }
      } catch (_) {}
      const extraButtonsImmediate = buildExtraButtonsWithRecruitId(recruitDataObj, recruitId);
      immediateContainer = buildContainerSimple({
        headerTitle: `${user.username}さんの募集`,
        detailsText,
        contentText,
        titleText: recruitDataObj?.title ? `## ${String(recruitDataObj.title).slice(0,200)}` : '',
        participantText,
        recruitIdText: recruitId,
        accentColor: accentColorInit,
        subHeaderText,
        avatarUrl,
        extraActionButtons: extraButtonsImmediate
      });
    } else {
      const extraButtonsImmediate = buildExtraButtonsWithRecruitId(recruitDataObj, recruitId);
      immediateContainer = buildContainer({
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

    const editPayload = { components: [immediateContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } };
    // 送信直後に保留ボタンが設定されている場合は、それも追加
    if (container.__addPendingButton && container.__pendingButtonRow) {
      editPayload.components.push(container.__pendingButtonRow);
    }
    // 画像スタイルでは添付ファイルを維持
    if (style === 'image' && image) {
      editPayload.files = [image];
    }

    await followUpMessage.edit(editPayload);
    // もう一つの投稿がある場合も同様に編集
    if (secondaryMessage && secondaryMessage.id) {
      const secondaryPayload = { ...editPayload };
      secondaryPayload.components = [immediateContainer];
      // 送信直後の保留ボタン対応
      if (container.__addPendingButton && container.__pendingButtonRow) {
        secondaryPayload.components.push(container.__pendingButtonRow);
      }
      await secondaryMessage.edit(secondaryPayload);
    }
  } catch (e) {
    console.warn('[handleRecruitCreateModal] Initial message edit failed:', e?.message || e);
  }
  
  return { followUpMessage, secondaryMessage };
}

// ------------------------------
// Recruitment Creation Modal Handler
// ------------------------------

function buildRecruitDataObject(interaction, pendingData, participantsNum, panelColor, selectedNotificationRole, voiceChannelName) {
  return {
    title: (pendingData?.title && pendingData.title.trim().length > 0) ? pendingData.title : '参加者募集',
    content: interaction.fields.getTextInputValue('content'),
    participants: participantsNum || pendingData?.participants || 1,
    startTime: pendingData?.startTime || '',
    vc: pendingData?.voice || '',
    voicePlace: pendingData?.voicePlace,
    voiceChannelId: pendingData?.voiceChannelId,
    voiceChannelName: voiceChannelName,
    recruiterId: interaction.user.id,
    recruitId: '',
    panelColor,
    notificationRoleId: selectedNotificationRole
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
  const buffer = await generateRecruitCard(recruitDataObj, currentParticipants, client, useColor);
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
  if (!(await enforceCooldown(interaction))) return null;
  if (!(await ensureNoActiveRecruit(interaction))) return null;

  const guildSettings = await getGuildSettings(interaction.guildId);
  const participantsNum = parseParticipantsNumFromModal(interaction);
  
  if (participantsNum === null) {
    await replyEphemeral(interaction, { 
      embeds: [createErrorEmbed('参加人数は1〜16の数字で入力してください。', '入力エラー')] 
    });
    return null;
  }

  return { guildSettings, participantsNum };
}

async function gatherRecruitmentInputs(interaction, guildSettings) {
  const panelColor = resolvePanelColor(interaction, guildSettings);
  const existingMembers = resolveExistingMembers(interaction);
  const selectedNotificationRole = resolveNotificationRole(interaction);
  const pendingData = pendingModalOptions.get(interaction.user.id);
  const voiceChannelName = await resolveVoiceChannelName(interaction, pendingData?.voiceChannelId);
  
  return {
    panelColor,
    existingMembers,
    selectedNotificationRole,
    pendingData,
    voiceChannelName
  };
}

async function prepareRecruitmentUI(interaction, guildSettings, recruitDataObj, currentParticipants, participantText, selectedNotificationRole, panelColor) {
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

/**
 * 募集作成モーダルの処理
 */
async function handleRecruitCreateModal(interaction) {
  try {
    const validation = await validateAndPrepareRecruitCreation(interaction);
    if (!validation) return;
    
    const { guildSettings, participantsNum } = validation;
    const inputs = await gatherRecruitmentInputs(interaction, guildSettings);
    const { panelColor, existingMembers, selectedNotificationRole, pendingData, voiceChannelName } = inputs;
    
    const recruitDataObj = buildRecruitDataObject(
      interaction, 
      pendingData, 
      participantsNum, 
      panelColor, 
      selectedNotificationRole, 
      voiceChannelName
    );
    
    // pendingModalOptionsを削除（全データ取得済み）
    if (interaction.user && interaction.user.id) {
      pendingModalOptions.delete(interaction.user.id);
    }
    
    const currentParticipants = buildCurrentParticipants(interaction, existingMembers);
    const participantText = buildParticipantText(currentParticipants, participantsNum);
    
    const uiData = await prepareRecruitmentUI(
      interaction, 
      guildSettings, 
      recruitDataObj, 
      currentParticipants, 
      participantText, 
      selectedNotificationRole, 
      panelColor
    );
    
    const { image, container, user, style, subHeaderText, configuredNotificationRoleIds } = uiData;

    // メッセージ送信と初期編集
    const result = await sendAndUpdateInitialMessage({ 
      interaction, selectedNotificationRole, configuredNotificationRoleIds, image, 
      container, guildSettings, user, recruitDataObj, style, panelColor, 
      participantText, subHeaderText, currentParticipants 
    });
    
    if (!result) return;
    
    const { followUpMessage, secondaryMessage } = result;

    // 送信後の保存とUI更新（確定画像/ID/ボタン）
    try {
      await finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, user, participantText, subHeaderText, followUpMessage, currentParticipants });
    } catch (error) { 
      logCriticalError('メッセージ取得エラー', error); 
    }

    await cleanupModalInteraction(interaction);
  } catch (error) {
    await handleRecruitModalError(interaction, error);
  }
}

// ------------------------------
// Main Modal Submit Dispatcher (Refactored)
// ------------------------------

/**
 * モーダル送信のメインディスパッチャー
 * 分岐ロジックを持たず、適切な handler に委譲する
 */
async function handleModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const handler = resolveModalHandler(interaction);
  if (!handler) {
    // 未知のモーダルタイプは無視
    return;
  }

  await handler(interaction);
}

/**
 * Validates if dedicated channel feature is enabled
 */
async function validateDedicatedChannelFeature(interaction, guildSettings) {
  if (!guildSettings?.enable_dedicated_channel) {
    await safeReply(interaction, {
      content: '⚠️ 専用チャンネル作成は現在オフになっています。設定画面からオンにしてください。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }
  return true;
}

/**
 * Checks if dedicated channel already exists for recruitment
 */
async function checkExistingDedicatedChannel(interaction, recruitId) {
  const { getDedicatedChannel } = require('../../utils/db/dedicatedChannels');
  const existingChannelId = await getDedicatedChannel(recruitId).catch(() => null);
  
  if (existingChannelId) {
    const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
    if (existingChannel) {
      await safeReply(interaction, { 
        content: `✨ 専用チャンネルは既に作成されています: <#${existingChannelId}>`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return true;
    }
  }
  return false;
}

/**
 * Loads participants for recruitment
 */
async function loadRecruitmentParticipants(recruitId) {
  const recruit = await getRecruitFromRedis(recruitId).catch(() => null);
  const messageId = recruit?.message_id || recruit?.messageId;
  let participants = [];
  
  try {
    if (messageId) {
      const persisted = await getParticipantsFromRedis(messageId);
      if (Array.isArray(persisted)) participants = persisted;
    }
    
    // Fallback to recruit data
    if (participants.length === 0 && recruit?.currentMembers) {
      participants = Array.isArray(recruit.currentMembers) ? recruit.currentMembers : [];
    }
  } catch (e) {
    console.warn('Failed to get participants:', e?.message || e);
  }
  
  return { participants, recruit };
}

/**
 * Validates user is a participant
 */
async function validateUserIsParticipant(interaction, participants) {
  if (!participants.includes(interaction.user.id)) {
    await safeReply(interaction, {
      content: '❌ この募集の参加者のみが専用チャンネルを作成できます。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }
  
  if (participants.length === 0) {
    await safeReply(interaction, { 
      content: '❌ 参加者がいないため、チャンネルを作成できません。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }
  
  return true;
}

/**
 * Validates bot has required permissions
 */
async function validateBotPermissions(interaction) {
  const me = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
  const missingPerms = [];
  
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    missingPerms.push('チャンネル管理');
  }
  
  if (missingPerms.length > 0) {
    await safeReply(interaction, {
      content: `❌ 専用チャンネルを作成できませんでした。BOTに次の権限を付与してください: ${missingPerms.join(', ')}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }
  
  return true;
}

/**
 * Creates permission overwrites for dedicated channel
 */
function buildDedicatedChannelPermissions(interaction, participants) {
  return [
    {
      id: interaction.guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks
      ]
    },
    ...participants.map(userId => ({
      id: userId,
      allow: [PermissionsBitField.Flags.ViewChannel]
    }))
  ];
}

/**
 * Sends welcome message to dedicated channel
 */
async function sendDedicatedChannelWelcome(channel, recruit, participants) {
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('🎮 専用チャンネルへようこそ')
      .setDescription(`**${recruit?.title || '募集'}** の専用チャンネルです。`)
      .setColor('#5865F2')
      .addFields(
        { name: '参加者', value: participants.map(id => `<@${id}>`).join(', ') || 'なし', inline: false }
      )
      .setFooter({ text: 'Recrubo' })
      .setTimestamp();
    
    await channel.send({ embeds: [welcomeEmbed] });
  } catch (error) {
    console.warn('[processCreateDedicatedChannel] welcome message failed:', error);
  }
}

async function processCreateDedicatedChannel(interaction, recruitId) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Validate feature enabled
    const guildSettings = await getGuildSettings(interaction.guildId).catch(() => ({}));
    if (!(await validateDedicatedChannelFeature(interaction, guildSettings))) return;
    
    // Check for existing channel
    if (await checkExistingDedicatedChannel(interaction, recruitId)) return;
    
    // Load participants
    const { participants, recruit } = await loadRecruitmentParticipants(recruitId);
    
    // Validate user is participant
    if (!(await validateUserIsParticipant(interaction, participants))) return;
    
    // Validate bot permissions
    if (!(await validateBotPermissions(interaction))) return;
    
    // Create dedicated channel
    const channelName = recruit?.title ? `${recruit.title}`.slice(0, 100) : `recruit-${recruitId}`;
    const permissionOverwrites = buildDedicatedChannelPermissions(interaction, participants);
    
    try {
      const dedicatedChannel = await interaction.guild.channels.create({
        name: channelName,
        type: 0, // Text Channel
        permissionOverwrites,
        topic: `🎮 ${recruit?.title || '募集'} の専用チャンネル`,
        parent: guildSettings?.dedicated_channel_category_id || undefined,
      });
      
      console.log('[processCreateDedicatedChannel] Channel created:', dedicatedChannel.id);
      
      // Save to Redis (best effort)
      try {
        const { saveDedicatedChannel } = require('../../utils/db/dedicatedChannels');
        await saveDedicatedChannel(recruitId, dedicatedChannel.id, 86400); // 24 hour TTL
      } catch (error) {
        console.warn('[processCreateDedicatedChannel] saveDedicatedChannel failed:', error);
      }
      
      // Send welcome message
      await sendDedicatedChannelWelcome(dedicatedChannel, recruit, participants);
      
      await safeReply(interaction, { 
        content: `✨ 専用チャンネルを作成しました: <#${dedicatedChannel.id}>`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
    } catch (error) {
      console.error('[processCreateDedicatedChannel] Channel creation failed:', error);
      await safeReply(interaction, {
        content: `❌ チャンネル作成に失敗しました。\n詳細: ${error?.message || '不明なエラー'}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      }).catch(() => null);
    }
  } catch (error) {
    console.error('[processCreateDedicatedChannel] Outer error:', error);
    await safeReply(interaction, {
      content: '❌ チャンネル作成に失敗しました。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    }).catch(() => null);
  }
}


async function handleButton(interaction) {
  const messageId = interaction.message.id;

  // 専用チャンネル作成ボタン
  if (interaction.customId.startsWith('create_vc_') || interaction.customId === 'create_vc_pending') {
    let recruitId = interaction.customId.replace('create_vc_', '');
    // pendingの場合はメッセージIDから算出
    if (!recruitId || recruitId === 'pending') {
      try {
        recruitId = String(interaction.message.id).slice(-8);
      } catch (_) {
        recruitId = null;
      }
    }
    if (recruitId) {
      await processCreateDedicatedChannel(interaction, recruitId);
      return;
    }
  }

  // hydrate participants if needed
  let participants = await hydrateParticipants(interaction, messageId);
  const savedRecruitData = await loadSavedRecruitData(interaction, messageId);

  const action = interaction.customId;
  if (action === 'join') {
    await processJoin(interaction, messageId, participants, savedRecruitData);
    return;
  }
  if (action === 'cancel') {
    participants = await processCancel(interaction, messageId, participants, savedRecruitData);
    return;
  }
  if (action === 'close') {
    await processClose(interaction, messageId, savedRecruitData);
    return;
  }
}

module.exports = { handleModalSubmit, handleButton };
