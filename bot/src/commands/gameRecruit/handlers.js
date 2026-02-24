const { MessageFlags, EmbedBuilder, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const { recruitParticipants, pendingModalOptions } = require('./state');
const { safeReply } = require('../../utils/safeReply');
const { createErrorEmbed } = require('../../utils/embedHelpers');
const { getGuildSettings, listRecruitsFromRedis, saveRecruitmentData, updateRecruitmentStatus, deleteRecruitmentData, saveRecruitToRedis, getRecruitFromRedis, saveParticipantsToRedis, getParticipantsFromRedis, deleteParticipantsFromRedis, pushRecruitToWebAPI, getCooldownRemaining, setCooldown } = require('../../utils/db');
const { buildContainer } = require('../../utils/recruitHelpers');
const { generateRecruitCardQueued } = require('../../utils/imageQueue');
const { updateParticipantList } = require('../../utils/recruitMessage');
const { EXEMPT_GUILD_IDS } = require('./constants');
const { handlePermissionError } = require('../../utils/handlePermissionError');

// Helper utilities (behavior-preserving refactor)

const MIN_PARTICIPANTS = 1;
const MAX_PARTICIPANTS = 16;

function computeDelayMs(targetTime, now = null) {
  if (!targetTime) return null;
  const target = new Date(targetTime).getTime();
  const current = now ? new Date(now).getTime() : Date.now();
  return target - current;
}

// 満員DMの重複送信防止
const _fullNotifySent = new Set();
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
      await safeReply(interaction, { content: `⏳ このサーバーの募集コマンドはクールダウン中です。あと ${mm}:${ss.toString().padStart(2, '0')} 待ってから再度お試しください。`, flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[rect cooldown check] failed:', e?.message || e);
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
        await safeReply(interaction, { embeds: [createErrorEmbed('このサーバーでは同時に実行できる募集は3件までです。\n既存の募集をいくつか締め切ってから新しい募集を作成してください。', '募集上限到達')], flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
        return false;
      }
    }
    return true;
  } catch (e) {
    console.warn('listRecruitsFromRedis failed:', e?.message || e);
    return true; // フェイルオープン（既存挙動と同等の寛容さ）
  }
}

function parseParticipantsNumFromModal(interaction) {
  const pending = interaction.user?.id ? pendingModalOptions.get(interaction.user.id) : null;
  const participantsNum = pending?.participants;
  
  if (!participantsNum || isNaN(participantsNum) || participantsNum < MIN_PARTICIPANTS || participantsNum > MAX_PARTICIPANTS) {
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

function resolvePanelColor(interaction, guildSettings) {
  let panelColor;
  try {
    const pending = interaction.user && interaction.user.id ? pendingModalOptions.get(interaction.user.id) : null;
    if (pending && typeof pending.panelColor === 'string' && pending.panelColor.length > 0) {
      panelColor = pending.panelColor;
      // pendingModalOptions.delete(interaction.user.id); // ここでは削除しない（後で削除）
    } else if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) {
      panelColor = interaction.recruitPanelColor;
    } else if (guildSettings.defaultColor) {
      panelColor = guildSettings.defaultColor;
    } else {
      // デフォルトは黒色
      panelColor = '000000';
    }
  } catch (e) {
    console.warn('handleModalSubmit: failed to retrieve pending modal options:', e?.message || e);
    if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) {
      panelColor = interaction.recruitPanelColor;
    } else if (guildSettings.defaultColor) {
      panelColor = guildSettings.defaultColor;
    } else {
      // デフォルトは黒色
      panelColor = '000000';
    }
  }
  return panelColor;
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

async function _selectNotificationRole(interaction, configuredIds) {
  // 事前選択（pending）
  try {
    const pending = interaction.user?.id ? pendingModalOptions.get(interaction.user.id) : null;
    const preSelected = pending?.notificationRoleId ? String(pending.notificationRoleId) : null;
    if (preSelected) {
      if (configuredIds.includes(preSelected)) {
        pendingModalOptions.delete(interaction.user.id);
        return { roleId: preSelected, aborted: false };
      }
      await safeReply(interaction, { content: '❌ 指定された通知ロールは使用できません（設定に含まれていません）。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
      return { roleId: null, aborted: true };
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
  if (!promptMessage?.awaitMessageComponent) {
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

// ヘルパー関数: メッセージ送信オプションを構築
function buildMessageOptions(container, image, extraComponents = []) {
  const baseOptions = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [], users: [] }
  };
  if (Array.isArray(extraComponents) && extraComponents.length > 0) {
    baseOptions.components.push(...extraComponents);
  }
  if (image) baseOptions.files = [image];
  return baseOptions;
}

// ヘルパー関数: 通知内容を作成
function createNotificationContent(roleId) {
  if (roleId === 'everyone') {
    return { content: '新しい募集が作成されました。@everyone', mentions: { parse: ['everyone'] } };
  }
  if (roleId === 'here') {
    return { content: '新しい募集が作成されました。@here', mentions: { parse: ['everyone'] } };
  }
  if (roleId) {
    return { content: `新しい募集が作成されました。<@&${roleId}>`, mentions: { roles: [roleId] } };
  }
  return { content: '新しい募集が作成されました。<@&1416797165769986161>', mentions: { roles: ['1416797165769986161'] } };
}

// ヘルパー関数: 非同期で通知を送信
function sendNotificationAsync(channel, roleId) {
  (async () => {
    try {
      const { content, mentions } = createNotificationContent(roleId);
      await channel.send({ content, allowedMentions: mentions });
    } catch (e) {
      console.warn('通知送信失敗:', e?.message || e);
    }
  })();
}

// 募集案内を送信（オプションベースのシグネチャ）
async function sendAnnouncements(interaction, options = {}) {
  const { selectedNotificationRole, configuredIds = [], image, container, guildSettings, extraComponents = [] } = options;
  const shouldUseDefaultNotification = !selectedNotificationRole && configuredIds.length === 0;
  
  // 通知を送信
  if (selectedNotificationRole || shouldUseDefaultNotification) {
    sendNotificationAsync(interaction.channel, selectedNotificationRole || null);
  }

  // メイン投稿
  const messageOptions = buildMessageOptions(container, image, extraComponents);
  const followUpMessage = await interaction.channel.send(messageOptions);
  let secondaryMessage = null;

  // 別チャンネルにも投稿
  const primaryRecruitChannelId = Array.isArray(guildSettings.recruit_channels) && guildSettings.recruit_channels.length > 0
    ? guildSettings.recruit_channels[0]
    : guildSettings.recruit_channel;

  if (!primaryRecruitChannelId || primaryRecruitChannelId === interaction.channelId) {
    return { mainMessage: followUpMessage, secondaryMessage: null };
  }

  try {
    const recruitChannel = await interaction.guild.channels.fetch(primaryRecruitChannelId);
    if (!recruitChannel?.isTextBased()) {
      return { mainMessage: followUpMessage, secondaryMessage: null };
    }

    // 別チャンネルでも通知を送信
    if (selectedNotificationRole || shouldUseDefaultNotification) {
      sendNotificationAsync(recruitChannel, selectedNotificationRole || null);
    }

    // 募集メッセージ投稿
    try {
      const secondaryOptions = buildMessageOptions(container, image, extraComponents);
      secondaryMessage = await recruitChannel.send(secondaryOptions);
    } catch (e) {
      console.warn('募集メッセージ送信失敗(指定ch):', e?.message || e);
    }
  } catch (channelError) {
    console.error('指定チャンネルへの送信でエラー:', channelError);
  }

  return { mainMessage: followUpMessage, secondaryMessage };
}

// ユーザーアバターを取得
async function fetchUserAvatarUrl(interaction) {
  try {
    const fetched = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
    if (fetched?.displayAvatarURL) {
      return fetched.displayAvatarURL({ size: 128, extension: 'png' });
    }
  } catch (_) {}
  return null;
}

// 最終的なRecruitDataを作成
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

// Webhook通知を送信
async function sendWebhookNotification(finalRecruitData, interaction, actualRecruitId, actualMessageId, avatarUrl) {
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
      author: { name: interaction.user.username, icon_url: avatarUrl || interaction.user.displayAvatarURL() },
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
    console.log('[webhook] 募集通知を送信しました:', actualRecruitId);
  } catch (err) {
    console.error('[webhook] 募集通知の送信に失敗:', err?.message || err);
  }
}

// RecruitDataを保存
async function shouldSaveRecruitData(finalRecruitData, actualRecruitId, interaction) {
  try {
    await saveRecruitToRedis(actualRecruitId, finalRecruitData);
    const pushRes = await pushRecruitToWebAPI(finalRecruitData);
    if (!pushRes?.ok) console.error('Worker API push failed:', pushRes);
    try {
      const workerSave = await saveRecruitmentData(interaction.guildId, interaction.channelId, finalRecruitData.message_id, interaction.guild?.name, interaction.channel?.name, finalRecruitData);
      if (!workerSave?.ok) console.error('[worker-sync] DO 保存失敗:', workerSave);
    } catch (saveErr) { console.error('[worker-sync] saveRecruitmentData error:', saveErr?.message || saveErr); }
  } catch (err) {
    console.error('Redis保存またはAPI pushエラー:', err);
  }
}

async function finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, user, participantText, subHeaderText, followUpMessage, currentParticipants }) {
  const actualMessage = followUpMessage;
  const actualMessageId = actualMessage.id;
  const actualRecruitId = actualMessageId.slice(-8);
  const finalRecruitData = createFinalRecruitData(actualRecruitId, actualMessageId, recruitDataObj, interaction);
  const avatarUrl = await fetchUserAvatarUrl(interaction);

  await shouldSaveRecruitData(finalRecruitData, actualRecruitId, interaction);
  await sendWebhookNotification(finalRecruitData, interaction, actualRecruitId, actualMessageId, avatarUrl);

  // 参加者保存（既存参加者を含む）
  recruitParticipants.set(actualMessageId, currentParticipants);
  try { await saveParticipantsToRedis(actualMessageId, currentParticipants); } catch (e) { console.warn('初期参加者のRedis保存に失敗:', e?.message || e); }

  // 画像とUIの更新（確定ID入り）
  let finalUseColor = finalRecruitData.panelColor ? finalRecruitData.panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000');
  finalUseColor = normalizeHex(finalUseColor, '000000');
    // スタイルに応じて画像生成を切り替え
    const styleForEdit = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
    let updatedImage = null;
    if (styleForEdit === 'image') {
      const updatedImageBuffer = await generateRecruitCardQueued(finalRecruitData, currentParticipants, interaction.client, finalUseColor);
      updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });
    }
  const finalAccentColor = /^[0-9A-Fa-f]{6}$/.test(finalUseColor) ? parseInt(finalUseColor, 16) : 0x000000;
  let updatedContainer;
  if (styleForEdit === 'simple') {
    const { buildContainerSimple } = require('../../utils/recruitHelpers');
      const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
      const startVal = finalRecruitData?.startTime ? String(finalRecruitData.startTime) : null;
      const membersVal = typeof finalRecruitData?.participants === 'number' ? `${finalRecruitData.participants}人` : null;
      let voiceVal = null;
      if (typeof finalRecruitData?.vc === 'string') {
        if (finalRecruitData.vc === 'あり(聞き専)') {
          voiceVal = finalRecruitData?.voicePlace ? `聞き専/${finalRecruitData.voicePlace}` : '聞き専';
        } else if (finalRecruitData.vc === 'あり') {
          voiceVal = finalRecruitData?.voicePlace ? `あり/${finalRecruitData.voicePlace}` : 'あり';
        } else if (finalRecruitData.vc === 'なし') {
          voiceVal = 'なし';
        }
      }
      const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
      const detailsText = `${labelsLine}\n${valuesLine}`;
    // 募集内容を取得して、ラベルを付ける
    const contentTextValue = finalRecruitData?.content || finalRecruitData?.note || finalRecruitData?.description || '';
    const contentText = contentTextValue && String(contentTextValue).trim().length > 0 
      ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}` 
      : '';
      const extraButtonsFinalSimple = [];
      if (finalRecruitData?.startTime === '今から') {
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        extraButtonsFinalSimple.push(
          new ButtonBuilder().setCustomId(`create_vc_${actualRecruitId}`).setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
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
    // 募集内容を取得して、ラベルを付ける
    const contentTextValue = finalRecruitData?.content || finalRecruitData?.note || finalRecruitData?.description || '';
    const contentText = contentTextValue && String(contentTextValue).trim().length > 0 
      ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}` 
      : '';
    /* quiet: avoid verbose content logging */
      const extraButtonsFinalImg = [];
      if (finalRecruitData?.startTime === '今から') {
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        extraButtonsFinalImg.push(
          new ButtonBuilder().setCustomId(`create_vc_${actualRecruitId}`).setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
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
      const editPayload = { components: [updatedContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } };

      if (updatedImage) editPayload.files = [updatedImage];
      await actualMessage.edit(editPayload);
    } catch (editError) { console.error('メッセージ更新エラー:', editError?.message || editError); }

  // 自動締切タイマー（8h）— 一時的に無効化
  // setTimeout(async () => {
  //   try {
  //     if (recruitParticipants.has(actualMessageId)) {
  //       console.log('8時間経過による自動締切実行:', actualMessageId);
  //       try { await autoCloseRecruitment(interaction.client, interaction.guildId, interaction.channelId, actualMessageId); } catch (e) { console.error('autoCloseRecruitment failed:', e); }
  //     }
  //   } catch (error) { console.error('自動締切処理でエラー:', error); }
  // }, eightHoursMs);

  // 開始時刻メンション（任意）- 重複防止のため1回のみ実行
  // 「今から」の場合は通知を出さない
  const startDelay = computeDelayMs(finalRecruitData.startAt, null);
  if (finalRecruitData.startTime !== '今から' && startDelay !== null && startDelay >= 0 && startDelay <= (36 * 60 * 60 * 1000)) { // 36h上限
    setTimeout(async () => {
      try {
        // 重複送信チェック
        if (startNotifySent.has(actualRecruitId)) { return; }
        startNotifySent.add(actualRecruitId);
        
        if (!recruitParticipants.has(actualMessageId)) return; // 既に終了
        const ids = await getParticipantsFromRedis(actualMessageId).catch(() => null) || recruitParticipants.get(actualMessageId) || [];
        if (!Array.isArray(ids) || ids.length === 0) return;
        
        const mentions = ids.map(id => `<@${id}>`).join(' ');
        
        // Embed作成
        const notifyColor = hexToIntColor(finalRecruitData?.panelColor || '00FF00', 0x00FF00);
        const notifyEmbed = new EmbedBuilder()
          .setColor(notifyColor)
          .setTitle('⏰ 開始時刻になりました！')
          .setDescription(`**${finalRecruitData.title}** の募集開始時刻です。`)
          .addFields(
            { name: '📋 参加者', value: mentions, inline: false }
          )
          .setTimestamp();
        
        // ボイスチャット情報
        if (finalRecruitData.voice === true) {
          if (finalRecruitData.voicePlace) {
            notifyEmbed.addFields({ name: '🔊 ボイスチャット', value: `あり (${finalRecruitData.voicePlace})`, inline: false });
          } else {
            notifyEmbed.addFields({ name: '🔊 ボイスチャット', value: 'あり', inline: false });
          }
        } else if (finalRecruitData.voice === false) {
          notifyEmbed.addFields({ name: '🔇 ボイスチャット', value: 'なし', inline: false });
        }
        
        // ボイスチャンネルURLをembedに追加
        if (finalRecruitData.voiceChannelId) {
          const voiceUrl = `https://discord.com/channels/${interaction.guildId}/${finalRecruitData.voiceChannelId}`;
          notifyEmbed.addFields({ name: '🔗 ボイスチャンネル', value: `[参加する](${voiceUrl})`, inline: false });
        }
        
        // 募集メッセージへのリンクを追加
        const recruitUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${actualMessageId}`;
        notifyEmbed.addFields({ name: '📋 募集の詳細', value: `[メッセージを確認](${recruitUrl})`, inline: false });
        
        // 専用チャンネル作成ボタンを追加
        const components = [];
        if (guildSettings?.enable_dedicated_channel) {
          const { ButtonBuilder, ButtonStyle } = require('discord.js');
          const button = new ButtonBuilder()
            .setCustomId(`create_vc_${actualRecruitId}`)
            .setLabel('専用チャンネル作成')
            .setEmoji('📢')
            .setStyle(ButtonStyle.Primary);
          const row = new ActionRowBuilder().addComponents(button);
          components.push(row);
        }
        
        // メッセージ送信（1回のみ）
        const sendOptions = { 
          content: mentions, 
          embeds: [notifyEmbed], 
          components,
          allowedMentions: { users: ids } 
        };
        
        await interaction.channel.send(sendOptions).catch(() => {});
      } catch (e) {
        console.warn('開始通知送信失敗:', e?.message || e);
      }
    }, startDelay);
  }

  // クールダウン設定
  try { if (!isGuildExempt(interaction.guildId)) await setCooldown(`rect:${interaction.guildId}`, 60); } catch (e) { console.warn('[rect cooldown set at submit] failed:', e?.message || e); }
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

function hexToIntColor(hex, fallbackInt) {
  const cleaned = (typeof hex === 'string' && hex.startsWith('#')) ? hex.slice(1) : hex;
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? parseInt(cleaned, 16) : fallbackInt;
}

async function processJoin(interaction, messageId, participants, savedRecruitData) {
  if (!participants.includes(interaction.user.id)) {
    participants.push(interaction.user.id);
    recruitParticipants.set(messageId, participants);
    saveParticipantsToRedis(messageId, participants).catch(e => console.warn('参加者保存失敗 (async):', e?.message || e));
    try {
      await safeReply(interaction, { content: '✅ 参加しました！', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
    } catch (e) {
      console.warn('quick reply failed:', e?.message || e);
    }
    
    // 参加通知を募集チャンネルに送信（専用チャンネルリンク付き）
    if (savedRecruitData && savedRecruitData.recruiterId && savedRecruitData.channelId) {
      (async () => {
        try {
          const { getDedicatedChannel } = require('../../utils/db/dedicatedChannels');
          const recruitId = savedRecruitData.recruitId || messageId.slice(-8);
          const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);
          
          const channel = await interaction.client.channels.fetch(savedRecruitData.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            let notificationContent = `🎉 <@${interaction.user.id}> が参加しました！`;
            if (dedicatedChannelId) {
              notificationContent += `\n🔗 専用チャンネル: <#${dedicatedChannelId}>`;
            }
            
            const notificationMsg = await channel.send({
              content: notificationContent,
              allowedMentions: { users: [] }
            });
            
            // 5分後に自動削除
            setTimeout(() => {
              notificationMsg.delete().catch(() => null);
            }, 5 * 60 * 1000);
          }
        } catch (e) { console.warn('notification message failed:', e?.message || e); }
      })();
    }
    
    if (savedRecruitData && savedRecruitData.recruiterId) {
      (async () => {
        try {
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
          if (recruiterUser && recruiterUser.send) await recruiterUser.send({ content: `あなたの募集に参加者が増えました: ${savedRecruitData.title || ''}`, embeds: [joinEmbed] }).catch(() => null);
        } catch (e) { console.warn('background recruiter notify failed:', e?.message || e); }
      })();
    }
  } else {
    await safeReply(interaction, { embeds: [createErrorEmbed('既に参加済みです。')], flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
  }
  updateParticipantList(interaction, participants, savedRecruitData).catch(e => console.warn('updateParticipantList failed (async):', e?.message || e));
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

async function processClose(interaction, messageId, savedRecruitData) {
  try {
    let data = savedRecruitData;
    if (!data) {
      try { const fromRedis = await getRecruitFromRedis(String(messageId).slice(-8)); if (fromRedis) data = fromRedis; } catch (e) { console.warn('close: getRecruitFromRedis failed:', e?.message || e); }
    }
    if (!data) {
      await safeReply(interaction, { embeds: [createErrorEmbed('募集データが見つからないため締め切れません。')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (data.recruiterId !== interaction.user.id) {
      await safeReply(interaction, { embeds: [createErrorEmbed('締め切りを実行できるのは募集主のみです。', '権限エラー')], flags: MessageFlags.Ephemeral });
      return;
    }

    let statusUpdateSuccess = false;
    try {
      const statusResult = await updateRecruitmentStatus(messageId, 'ended', new Date().toISOString());
      if (statusResult?.ok) statusUpdateSuccess = true; else console.warn('管理ページの募集ステータス更新が警告:', statusResult);
    } catch (error) { console.error('管理ページの募集ステータス更新に失敗:', error); }

    try {
      if (statusUpdateSuccess) {
        const delRes = await deleteRecruitmentData(messageId, interaction.user.id);
        if (!delRes?.ok && delRes?.status !== 404) console.warn('管理API: 募集データ削除の結果が不正です:', delRes);
      }
    } catch (err) { console.error('募集データの削除に失敗:', err); }

    // Disable UI (Components v2) — preserve info in closed view
    const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder } = require('discord.js');
    const { generateClosedRecruitCardQueued, generateRecruitCardQueued } = require('../../utils/imageQueue');
    const disabledContainer = new ContainerBuilder();
    disabledContainer.setAccentColor(0x808080);
    const originalMessage = interaction.message;
    const hasAttachment = !!originalMessage?.attachments && originalMessage.attachments.size > 0;
    
    // 閉鎖画像の生成（灰色化 + CLOSED オーバーレイ）
    let closedAttachment = null;
    let baseImageBuffer = null;
    if (hasAttachment) {
      try {
        const originalAttachmentUrl = originalMessage.attachments.first().url;
        const response = await fetch(originalAttachmentUrl);
        const arrayBuffer = await response.arrayBuffer();
        baseImageBuffer = Buffer.from(arrayBuffer);
      } catch (imgErr) {
        console.warn('[processClose] Failed to fetch original image:', imgErr);
      }
    }
    if (!baseImageBuffer) {
      try {
        let useColor = data?.panelColor || '808080';
        if (typeof useColor === 'string' && useColor.startsWith('#')) useColor = useColor.slice(1);
        if (!/^[0-9A-Fa-f]{6}$/.test(useColor)) useColor = '808080';
        const currentParticipants = recruitParticipants.get(messageId) || [];
        baseImageBuffer = await generateRecruitCardQueued(data, currentParticipants, interaction.client, useColor);
      } catch (imgErr) {
        console.warn('[processClose] Failed to generate base recruit image:', imgErr);
      }
    }
    if (baseImageBuffer) {
      try {
        const closedImageBuffer = await generateClosedRecruitCardQueued(baseImageBuffer);
        closedAttachment = new AttachmentBuilder(closedImageBuffer, { name: 'recruit-card-closed.png' });
      } catch (imgErr) {
        console.warn('[processClose] Failed to generate closed image:', imgErr);
      }
    }
    
    // Closed header
    // 画像版の場合は画像 + 参加リスト + フッターを表示
    if (closedAttachment) {
      disabledContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://recruit-card-closed.png')
        )
      );
      disabledContainer.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
      // Final participants list
      const finalParticipants = recruitParticipants.get(messageId) || [];
      const totalMembers = (typeof data?.participants === 'number') ? data.participants : (typeof data?.participant_count === 'number' ? data.participant_count : null);
      const totalSlots = totalMembers || finalParticipants.length;
      const finalParticipantText = `📋 参加リスト (最終 ${finalParticipants.length}/${totalSlots}人)\n${finalParticipants.map(id => `<@${id}>`).join(' • ')}`;
      disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(finalParticipantText));
      disabledContainer.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
      const footerMessageId = interaction.message.interaction?.id || interaction.message.id;
      disabledContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`募集ID：\`${footerMessageId.slice(-8)}\` | powered by **Recrubo**`)
      );
    } else {
      // 画像がない場合のフォールバック表示
      disabledContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('🎮✨ **募集締め切り済み** ✨🎮')
      );
      // Title inside component
      if (data?.title) {
        disabledContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`📌 タイトル\n${String(data.title).slice(0,200)}`)
        );
      }
      disabledContainer.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
      // Image section if original had attachment (image style)
      if (hasAttachment) {
        disabledContainer.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(originalMessage.attachments.first().url)
          )
        );
        disabledContainer.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
      }
      // Details（募集中と同じく横一列・コンパクト表記）
      const startLabel = data?.startTime ? `🕒 ${data.startTime}` : null;
      const totalMembers = (typeof data?.participants === 'number') ? data.participants : (typeof data?.participant_count === 'number' ? data.participant_count : null);
      const membersLabel = (typeof totalMembers === 'number') ? `👥 ${totalMembers}人` : null;
      let voiceLabel = null;
      if (typeof data?.vc === 'string') {
        if (data.vc === 'あり(聞き専)') {
          voiceLabel = data?.voicePlace ? `🎙 聞き専/${data.voicePlace}` : '🎙 聞き専';
        } else if (data.vc === 'あり') {
          voiceLabel = data?.voicePlace ? `🎙 あり/${data.voicePlace}` : '🎙 あり';
        } else if (data.vc === 'なし') {
          voiceLabel = '🎙 なし';
        }
      } else if (data?.voice === true) {
        voiceLabel = data?.voicePlace ? `🎙 あり/${data.voicePlace}` : '🎙 あり';
      } else if (data?.voice === false) {
        voiceLabel = '🎙 なし';
      }
      const detailsText = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
      if (detailsText) {
        disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailsText));
      }
      // Content (no divider between details and content)
      const contentText = data?.content ? `📝 募集内容\n${String(data.content).slice(0,1500)}` : '';
      if (contentText) {
        disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentText));
      }
      // Separator before participants
      disabledContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      // Final participants list
      const finalParticipants = recruitParticipants.get(messageId) || [];
      const totalSlots = totalMembers || finalParticipants.length;
      const finalParticipantText = `📋 参加リスト (最終 ${finalParticipants.length}/${totalSlots}人)\n${finalParticipants.map(id => `<@${id}>`).join(' • ')}`;
      disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(finalParticipantText));
      // Closed note
      disabledContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      disabledContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('🔒 **この募集は締め切られました** 🔒'));
      const footerMessageId = interaction.message.interaction?.id || interaction.message.id;
      disabledContainer.addSeparatorComponents(
        new (require('discord.js').SeparatorBuilder)().setSpacing(require('discord.js').SeparatorSpacingSize.Small).setDivider(true)
      ).addTextDisplayComponents(
        new (require('discord.js').TextDisplayBuilder)().setContent(`募集ID：\`${footerMessageId.slice(-8)}\` | powered by **Recrubo**`)
      );
    }
    
    const editPayload = {
      components: [disabledContainer],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { roles: [], users: [] }
    };
    
    if (closedAttachment) {
      editPayload.files = [closedAttachment];
    }
    
    await interaction.message.edit(editPayload);

    if (data && data.recruiterId) {
      const finalParticipants = recruitParticipants.get(messageId) || [];
      const closeColor = hexToIntColor(data?.panelColor || '808080', 0x808080);
      const closeEmbed = new EmbedBuilder()
        .setColor(closeColor)
        .setTitle('🔒 募集締切')
        .setDescription(`**${data.title}** の募集を締め切りました。`)
        .addFields({ name: '最終参加者数', value: `${finalParticipants.length}/${data.participants}人`, inline: false });
      try { await safeReply(interaction, { content: `<@${data.recruiterId}>`, embeds: [closeEmbed], allowedMentions: { users: [data.recruiterId] } }); } catch (e) { console.warn('safeReply failed during close handling:', e?.message || e); }
      recruitParticipants.delete(messageId);
      try { await deleteParticipantsFromRedis(messageId); } catch (e) { console.warn('Redis参加者削除失敗:', e?.message || e); }
      try { const rid = data?.recruitId || String(messageId).slice(-8); if (rid) { const { deleteRecruitFromRedis } = require('../../utils/db'); await deleteRecruitFromRedis(rid); } } catch (e) { console.warn('Redis recruit削除失敗:', e?.message || e); }
      
      // 専用チャンネルを5分後に削除
      (async () => {
        try {
          const { getDedicatedChannel, deleteDedicatedChannel } = require('../../utils/db/dedicatedChannels');
          const recruitId = data?.recruitId || String(messageId).slice(-8);
          const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);
          
          if (dedicatedChannelId) {
            // 専用チャンネルに削除予告メッセージを送信
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
            
            // 5分後に削除
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
            }, 5 * 60 * 1000); // 5分後
          }
        } catch (e) {
          console.warn('[processClose] Error managing dedicated channel:', e?.message || e);
        }
      })();
    } else {
      await safeReply(interaction, { content: '🔒 募集を締め切りました。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
    }
  } catch (e) {
    console.error('close button handler error:', e);
  }
}

async function handleModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  // quiet

  if (interaction.customId !== 'recruitModal') {
    // ignore other modals
    return;
  }

  try {
      // 前処理: クールダウン + 同時募集制限(最大3件)
      // enforce guild concurrent limit to 3 via ensureNoActiveRecruit
    if (!(await enforceCooldown(interaction))) return;
    if (!(await ensureNoActiveRecruit(interaction))) return;

    const guildSettings = await getGuildSettings(interaction.guildId);

    const participantsNum = parseParticipantsNumFromModal(interaction);
    if (participantsNum === null) {
      await safeReply(interaction, { embeds: [createErrorEmbed('参加人数は1〜16の数字で入力してください。', '入力エラー')], flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
      return;
    }

    // 色決定: select > settings > default
    const panelColor = resolvePanelColor(interaction, guildSettings);

    // 既存参加者の取得（モーダル内のUserSelectMenuから） - botを除外
    let existingMembers = [];
    try {
      const selectedMembers = interaction.fields.getSelectedMembers('existingMembers');
      if (selectedMembers && selectedMembers.size > 0) {
        // 募集主以外 & bot以外のメンバーを抽出
        existingMembers = Array.from(selectedMembers.keys()).filter(id => {
          const member = selectedMembers.get(id);
          return id !== interaction.user.id && !(member?.user?.bot);
        });
        // keep silent
      }
    } catch (_e) {
      // no existing members selected
      existingMembers = [];
    }

    // 通知ロールの取得（モーダル内のStringSelectMenuから）
    let selectedNotificationRole = null;
    try {
      const values = interaction.fields.getStringSelectValues('notificationRole');
      if (values && values.length > 0) {
        const roleId = values[0];
        if (roleId === 'none') {
          // 「通知なし」が選択された
          selectedNotificationRole = null;
          // none selected
        } else if (roleId === 'everyone' || roleId === 'here') {
          // @everyone または @here が選択された
          selectedNotificationRole = roleId;
          // special role selected
        } else {
          // ロールIDが選択された（StringSelectMenuなので設定済みロールのみが選択肢）
          selectedNotificationRole = roleId;
          // role selected
        }
      }
    } catch (_e) {
      // no notification role selected
      selectedNotificationRole = null;
    }

    const pendingData = pendingModalOptions.get(interaction.user.id);
    // quiet
    
    // 通話場所のチャンネル名を取得
    let voiceChannelName = null;
    if (pendingData?.voiceChannelId) {
      try {
        const voiceChannel = await interaction.guild.channels.fetch(pendingData.voiceChannelId);
        if (voiceChannel) {
          voiceChannelName = voiceChannel.name;
        }
      } catch (e) {
        console.warn('Failed to fetch voice channel:', e?.message || e);
      }
    }
    
    const recruitDataObj = {
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
      panelColor
    };
    // quiet
    
    // pendingModalOptionsを削除（全データ取得済み）
    if (interaction.user && interaction.user.id) {
      pendingModalOptions.delete(interaction.user.id);
      // cleared pending
    }
    
    // 通知ロールをrecruitDataObjに追加
    recruitDataObj.notificationRoleId = selectedNotificationRole;

    // カード生成と初回送信
    // 既存参加者を含める（募集主 + 既存参加者、重複排除）
    const currentParticipants = [interaction.user.id, ...existingMembers.filter(id => id !== interaction.user.id)];
    let useColor = normalizeHex(panelColor ? panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000'), '000000');
    const user = interaction.targetUser || interaction.user;
    // スタイルに応じて画像生成を切り替え
    const style = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
    let image = null;
    if (style === 'image') {
      const buffer = await generateRecruitCardQueued(recruitDataObj, currentParticipants, interaction.client, useColor);
      image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
    }
    
    // 参加リストテキストの構築（既存参加者を含む、改行なし、残り人数表示）
    const remainingSlots = participantsNum - currentParticipants.length;
    let participantText = `**📋 参加リスト** \`(あと${remainingSlots}人)\`\n`;
    participantText += currentParticipants.map(id => `<@${id}>`).join(' • ');
    
    // 通知ロールをヘッダーの下（subHeaderText）に表示
    let subHeaderText = null;
    if (selectedNotificationRole) {
      if (selectedNotificationRole === 'everyone') {
        subHeaderText = '🔔 通知ロール: @everyone';
      } else if (selectedNotificationRole === 'here') {
        subHeaderText = '🔔 通知ロール: @here';
      } else {
        subHeaderText = `🔔 通知ロール: <@&${selectedNotificationRole}>`;
      }
    }
    
    const panelColorForAccent = normalizeHex(panelColor, guildSettings.defaultColor && /^[0-9A-Fa-f]{6}$/.test(guildSettings.defaultColor) ? guildSettings.defaultColor : '000000');
    const accentColor = /^[0-9A-Fa-f]{6}$/.test(panelColorForAccent) ? parseInt(panelColorForAccent, 16) : 0x000000;
    
    const configuredNotificationRoleIds = buildConfiguredNotificationRoleIds(guildSettings);
    let container;
    if (style === 'simple') {
      const { buildContainerSimple } = require('../../utils/recruitHelpers');
      const startLabel = recruitDataObj?.startTime ? `🕒 ${recruitDataObj.startTime}` : null;
      const membersLabel = typeof recruitDataObj?.participants === 'number' ? `👥 ${recruitDataObj.participants}人` : null;
      const voiceLabel = (() => {
        if (recruitDataObj?.vc === 'あり(聞き専)') {
          return recruitDataObj?.voicePlace ? `🎙 聞き専/${recruitDataObj.voicePlace}` : '🎙 聞き専';
        } else if (recruitDataObj?.vc === 'あり') {
          return recruitDataObj?.voicePlace ? `🎙 あり/${recruitDataObj.voicePlace}` : '🎙 あり';
        } else if (recruitDataObj?.vc === 'なし') {
          return '🎙 なし';
        }
        return null;
      })();
      const valuesLine = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
      const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
      const detailsText = [labelsLine, valuesLine].filter(Boolean).join('\n');
      // 募集内容: ユーザー入力のマークダウンを保持し、ラベルは太字で強調
      const contentText = recruitDataObj?.content && String(recruitDataObj.content).trim().length > 0 
        ? `**📝 募集内容**\n${String(recruitDataObj.content).slice(0,1500)}` 
        : '';
      // quiet
      const titleText = recruitDataObj?.title ? `## ${String(recruitDataObj.title).slice(0,200)}` : '';
      // 募集主のアバターURL（右上サムネイル用）: client経由でfetch
      let avatarUrl = null;
      try {
        const fetchedUser = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
        if (fetchedUser && typeof fetchedUser.displayAvatarURL === 'function') {
          avatarUrl = fetchedUser.displayAvatarURL({ size: 128, extension: 'png' });
        }
      } catch (_) {}
      const extraButtons = [];
      if (recruitDataObj?.startTime === '今から') {
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        extraButtons.push(
          new ButtonBuilder().setCustomId('create_vc_pending').setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
        );
      }
      container = buildContainerSimple({
        headerTitle: `${user.username}さんの募集`,
        detailsText,
        contentText,
        titleText,
        participantText,
        recruitIdText: '(作成中)',
        accentColor,
        subHeaderText,
        avatarUrl,
        extraActionButtons: extraButtons
      });
    } else {
      const { buildContainer } = require('../../utils/recruitHelpers');
      const contentText = '';
      const titleText = '';
      // 画像スタイルでもヘッダー右上にアバター表示
      // 画像スタイルでは右上サムネイルのアバターは非表示
      const extraButtons = [];
      if (recruitDataObj?.startTime === '今から') {
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        extraButtons.push(
          new ButtonBuilder().setCustomId('create_vc_pending').setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
        );
      }
      container = buildContainer({
        headerTitle: `${user.username}さんの募集`, 
        subHeaderText, 
        contentText,
        titleText,
        participantText, 
        recruitIdText: '(作成中)', 
        accentColor, 
        imageAttachmentName: 'attachment://recruit-card.png', 
        recruiterId: interaction.user.id, 
        requesterId: interaction.user.id,
        extraActionButtons: extraButtons
      });
    }

    // ここで投稿を行う（通知・画像・UI含む）
    let followUpMessage, secondaryMessage;
    try {
      const announceRes = await sendAnnouncements(interaction, {
        selectedNotificationRole,
        configuredIds: configuredNotificationRoleIds,
        image,
        container,
        guildSettings,
        user
      });
      followUpMessage = announceRes.mainMessage;
      secondaryMessage = announceRes.secondaryMessage;
    } catch (e) {
      console.warn('[handleModalSubmit] sendAnnouncements failed:', e?.message || e);
      
      // 権限エラーの場合はDMに通知
      if (e.code === 50001 || e.code === 50013) {
        try {
          await handlePermissionError(user, e, {
            commandName: 'rect',
            channelName: interaction.channel.name
          });
        } catch (dmErr) {
          console.error('[handleModalSubmit] Failed to send permission error DM:', dmErr?.message || dmErr);
        }
      }
    }

    const msgId = followUpMessage?.id;
    if (!msgId) return;

    const recruitId = msgId.slice(-8);
    const { buildContainerSimple } = require('../../utils/recruitHelpers');
    const styleForInit = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
    const useColorInit = normalizeHex(panelColor ? panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000'), '000000');
    const accentColorInit = /^[0-9A-Fa-f]{6}$/.test(useColorInit) ? parseInt(useColorInit, 16) : 0x000000;

    try {
      let immediateContainer;
      if (styleForInit === 'simple') {
        const startLabel = recruitDataObj?.startTime ? `🕒 ${recruitDataObj.startTime}` : null;
        const membersLabel = typeof recruitDataObj?.participants === 'number' ? `👥 ${recruitDataObj.participants}人` : null;
        const voiceLabel = (() => {
          if (recruitDataObj?.vc === 'あり(聞き専)') {
            return recruitDataObj?.voicePlace ? `🎙 聞き専/${recruitDataObj.voicePlace}` : '🎙 聞き専';
          } else if (recruitDataObj?.vc === 'あり') {
            return recruitDataObj?.voicePlace ? `🎙 あり/${recruitDataObj.voicePlace}` : '🎙 あり';
          } else if (recruitDataObj?.vc === 'なし') {
            return '🎙 なし';
          }
          return null;
        })();
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
        const extraButtonsImmediate = [];
        if (recruitDataObj?.startTime === '今から') {
          const { ButtonBuilder, ButtonStyle } = require('discord.js');
          extraButtonsImmediate.push(
            new ButtonBuilder().setCustomId(`create_vc_${recruitId}`).setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
          );
        }
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
        const extraButtonsImmediate = [];
        if (recruitDataObj?.startTime === '今から') {
          const { ButtonBuilder, ButtonStyle } = require('discord.js');
          extraButtonsImmediate.push(
            new ButtonBuilder().setCustomId(`create_vc_${recruitId}`).setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)
          );
        }
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
      if (styleForInit === 'image' && image) {
        editPayload.files = [image];
      }

      // 追加のアクション行は不要（同じ行に組み込まれている）

      await followUpMessage.edit(editPayload);
      // もう一つの投稿がある場合も同様に編集
      if (secondaryMessage && secondaryMessage.id) {
        const _secondaryRecruitId = secondaryMessage.id.slice(-8);
        // ボタンのcustomIdはrecruitIdに依存するため再構築
        const secondaryPayload = { ...editPayload };
        secondaryPayload.components = [immediateContainer];
        // 送信直後の保留ボタン対応
        if (container.__addPendingButton && container.__pendingButtonRow) {
          secondaryPayload.components.push(container.__pendingButtonRow);
        }
        await secondaryMessage.edit(secondaryPayload);
      }
      // updated initial message
    } catch (e) {
      console.warn('[handleModalSubmit] Initial message edit failed:', e?.message || e);
    }

    // 送信後の保存とUI更新（確定画像/ID/ボタン）
    try {
      await finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, user, participantText, subHeaderText, followUpMessage, currentParticipants });
    } catch (error) { console.error('メッセージ取得エラー:', error); }

    // インタラクション応答を完了（defer された応答を削除）
    try {
      await interaction.deleteReply();
    } catch (e) {
      console.warn('[handleModalSubmit] Failed to delete deferred reply:', e?.message || e);
    }
  } catch (error) {
    console.error('handleModalSubmit error:', error);
    if (error && error.code === 10062) return; // Unknown interaction
    if (!interaction.replied && !interaction.deferred) {
      try { await safeReply(interaction, { content: `モーダル送信エラー: ${error.message || error}`, flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } }); } catch (e) { console.error('二重応答防止: safeReply failed', e); }
    } else {
      try { await interaction.editReply({ content: `❌ モーダル送信エラー: ${error.message || error}` }); } catch (e) { console.error('editReply failed', e); }
    }
  }
}

async function processCreateDedicatedChannel(interaction, recruitId) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildSettings = await getGuildSettings(interaction.guildId).catch(() => ({}));
    if (!guildSettings?.enable_dedicated_channel) {
      await safeReply(interaction, {
        content: '⚠️ 専用チャンネル作成は現在オフになっています。設定画面からオンにしてください。',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return;
    }

    const { saveDedicatedChannel, getDedicatedChannel } = require('../../utils/db/dedicatedChannels');
    
    // 既に専用チャンネルが作成されているか確認
    const existingChannelId = await getDedicatedChannel(recruitId).catch(() => null);
    if (existingChannelId) {
      const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
      if (existingChannel) {
        await safeReply(interaction, { 
          content: `✨ 専用チャンネルは既に作成されています: <#${existingChannelId}>`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }
    }
    
    // 募集データを取得して参加者リストを確認
    const recruit = await getRecruitFromRedis(recruitId).catch(() => null);
    const messageId = recruit?.message_id || recruit?.messageId || interaction?.message?.id;
    let participants = [];
    try {
      if (messageId) {
        const persisted = await getParticipantsFromRedis(messageId);
        if (Array.isArray(persisted)) participants = persisted;
      }
      // messageIdがない場合やRedisにない場合、募集データから取得を試みる
      if (participants.length === 0 && recruit?.currentMembers) {
        participants = Array.isArray(recruit.currentMembers) ? recruit.currentMembers : [];
      }
    } catch (e) {
      console.warn('Failed to get participants:', e?.message || e);
    }
    
    // 参加者限定: 押下ユーザーが参加者に含まれているかチェック
    if (!participants.includes(interaction.user.id)) {
      await safeReply(interaction, {
        content: '❌ この募集の参加者のみが専用チャンネルを作成できます。',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return;
    }

    if (participants.length === 0) {
      await safeReply(interaction, { 
        content: '❌ 参加者がいないため、チャンネルを作成できません。',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return;
    }

    // 必要権限チェック（チャンネル作成/権限上書き）
    const me = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    const missingPerms = [];
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) missingPerms.push('チャンネル管理');
    if (missingPerms.length > 0) {
      await safeReply(interaction, {
        content: `❌ 専用チャンネルを作成できませんでした。BOTに次の権限を付与してください: ${missingPerms.join(', ')}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return;
    }
    
    // 専用チャンネルを作成（参加者のみが見える）
    const channelName = recruit?.title ? `${recruit.title}`.slice(0, 100) : `recruit-${recruitId}`;
    
    const permissionOverwrites = [
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
    
    try {
      console.log('[processCreateDedicatedChannel] Creating channel:', {
        name: channelName,
        botId: interaction.client.user.id,
        participantsCount: participants.length,
        permissionOverwrites: JSON.stringify(permissionOverwrites.map(p => ({
          id: p.id,
          allow: Array.isArray(p.allow) ? p.allow.length : 0,
          deny: Array.isArray(p.deny) ? p.deny.length : 0
        })))
      });

      const dedicatedChannel = await interaction.guild.channels.create({
        name: channelName,
        type: 0, // Text Channel
        permissionOverwrites,
        topic: `🎮 ${recruit?.title || '募集'} の専用チャンネル`,
        parent: guildSettings?.dedicated_channel_category_id || undefined,
      });

      console.log('[processCreateDedicatedChannel] Channel created:', dedicatedChannel.id);

      // ここから先は「作成済み」を前提にベストエフォート。失敗しても作成結果は返す。
      try {
        // Redis に保存（86400秒 = 24時間のTTL）
        await saveDedicatedChannel(recruitId, dedicatedChannel.id, 86400);
      } catch (error) {
        console.warn('[processCreateDedicatedChannel] saveDedicatedChannel failed:', error);
      }

      try {
        // ウェルカムメッセージを送信
        const welcomeEmbed = new EmbedBuilder()
          .setTitle('🎮 専用チャンネルへようこそ')
          .setDescription(`**${recruit?.title || '募集'}** の専用チャンネルです。`)
          .setColor('#5865F2')
          .addFields(
            { name: '参加者', value: participants.map(id => `<@${id}>`).join(', ') || 'なし', inline: false }
          )
          .setFooter({ text: 'Recrubo' })
          .setTimestamp();

        await dedicatedChannel.send({ embeds: [welcomeEmbed] });
      } catch (error) {
        console.warn('[processCreateDedicatedChannel] welcome message failed:', error);
      }

      await safeReply(interaction, { 
        content: `✨ 専用チャンネルを作成しました: <#${dedicatedChannel.id}>`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
    } catch (error) {
      console.error('[processCreateDedicatedChannel] Channel creation failed:', error);
      console.error('[processCreateDedicatedChannel] Error details:', {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        stack: error?.stack
      });
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
