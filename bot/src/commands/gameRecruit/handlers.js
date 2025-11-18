const { MessageFlags, EmbedBuilder, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const { recruitParticipants, pendingModalOptions } = require('./state');
const { safeReply } = require('../../utils/safeReply');
const { getGuildSettings, listRecruitsFromRedis, saveRecruitmentData, updateRecruitmentStatus, deleteRecruitmentData, saveRecruitToRedis, getRecruitFromRedis, saveParticipantsToRedis, getParticipantsFromRedis, deleteParticipantsFromRedis, pushRecruitToWebAPI, getCooldownRemaining, setCooldown } = require('../../utils/db');
const { buildContainer } = require('../../utils/recruitHelpers');
const { generateRecruitCard } = require('../../utils/canvasRecruit');
const { updateParticipantList, autoCloseRecruitment } = require('../../utils/recruitMessage');
const { EXEMPT_GUILD_IDS } = require('./constants');

// ------------------------------
// Helper utilities (behavior-preserving refactor + new features)
// ------------------------------

// 満員DMの重複送信防止
const fullNotifySent = new Set();

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
      if (matched.length >= 1) {
        await safeReply(interaction, { content: '❌ このサーバーでは同時に実行できる募集は1件までです。既存の募集を締め切ってから新しい募集を作成してください。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
        return false;
      }
    }
    return true;
  } catch (e) {
    console.warn('listRecruitsFromRedis failed:', e?.message || e);
    return true; // フェイルオープン（既存挙動と同等の寛容さ）
  }
}

// 期限/開始のフォーマッタ（JST）
function formatJST(iso) {
  try {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
  } catch (_) { return null; }
}

function computeDelayMs(targetISO, fallbackMs) {
  try {
    if (!targetISO) return fallbackMs;
    const now = Date.now();
    const t = new Date(targetISO).getTime();
    if (isNaN(t)) return fallbackMs;
    const diff = t - now;
    if (diff < 0) return 0;
    return diff;
  } catch (_) { return fallbackMs; }
}

function normalizeHex(color, fallback = '000000') {
  let use = color;
  if (typeof use === 'string' && use.startsWith('#')) use = use.slice(1);
  if (typeof use !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(use)) return fallback;
  return use;
}

// resolvePanelColor は pending の削除を行わないように未使用化（handleModalSubmit で決定）

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

async function sendAnnouncements(interaction, selectedNotificationRole, configuredIds, image, container, guildSettings) {
  const shouldUseDefaultNotification = !selectedNotificationRole && configuredIds.length === 0;
  if (selectedNotificationRole) {
    (async () => { try { await interaction.channel.send({ content: `新しい募集が作成されました。<@&${selectedNotificationRole}>`, allowedMentions: { roles: [selectedNotificationRole] } }); } catch (e) { console.warn('通知送信失敗 (selected)', e?.message || e); } })();
  } else if (shouldUseDefaultNotification) {
    (async () => { try { await interaction.channel.send({ content: '新しい募集が作成されました。<@&1416797165769986161>', allowedMentions: { roles: ['1416797165769986161'] } }); } catch (e) { console.warn('通知送信失敗 (default)', e?.message || e); } })();
  }

  // 画像とUIの投稿
  const followUpMessage = await interaction.channel.send({ files: [image], components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });

  // 別チャンネルにも投稿
  if (guildSettings.recruit_channel && guildSettings.recruit_channel !== interaction.channelId) {
    try {
      const recruitChannel = await interaction.guild.channels.fetch(guildSettings.recruit_channel);
      if (recruitChannel && recruitChannel.isTextBased()) {
        if (selectedNotificationRole) {
          (async () => { try { await recruitChannel.send({ content: `新しい募集が作成されました。<@&${selectedNotificationRole}>`, allowedMentions: { roles: [selectedNotificationRole] } }); } catch (e) { console.warn('通知送信失敗 (指定ch, selected):', e?.message || e); } })();
        } else if (shouldUseDefaultNotification) {
          (async () => { try { await recruitChannel.send({ content: '新しい募集が作成されました。<@&1416797165769986161>', allowedMentions: { roles: ['1416797165769986161'] } }); } catch (e) { console.warn('通知送信失敗 (指定ch, default):', e?.message || e); } })();
        }
        (async () => { try { await recruitChannel.send({ files: [image], components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } }); } catch (e) { console.warn('募集メッセージ送信失敗(指定ch):', e?.message || e); } })();
      }
    } catch (channelError) { console.error('指定チャンネルへの送信でエラー:', channelError); }
  }

  return followUpMessage;
}

async function finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, user, participantText, followUpMessage }) {
  const actualMessage = followUpMessage;
  const actualMessageId = actualMessage.id;
  const actualRecruitId = actualMessageId.slice(-8);
  recruitDataObj.recruitId = actualRecruitId;
  const finalRecruitData = { ...recruitDataObj, guildId: interaction.guildId, channelId: interaction.channelId, message_id: actualMessageId, status: 'recruiting', start_time: new Date().toISOString() };

  try {
    await saveRecruitToRedis(actualRecruitId, finalRecruitData);
    const pushRes = await pushRecruitToWebAPI(finalRecruitData);
    if (!pushRes || !pushRes.ok) console.error('Worker API push failed:', pushRes);
    try {
      const workerSave = await saveRecruitmentData(interaction.guildId, interaction.channelId, actualMessageId, interaction.guild?.name, interaction.channel?.name, finalRecruitData);
      if (!workerSave?.ok) console.error('[worker-sync] DO 保存失敗:', workerSave);
    } catch (saveErr) { console.error('[worker-sync] saveRecruitmentData error:', saveErr?.message || saveErr); }
  } catch (err) { console.error('Redis保存またはAPI pushエラー:', err); }

  // 参加者保存
  recruitParticipants.set(actualMessageId, [interaction.user.id]);
  try { await saveParticipantsToRedis(actualMessageId, [interaction.user.id]); } catch (e) { console.warn('初期参加者のRedis保存に失敗:', e?.message || e); }

  // 画像とUIの更新（確定ID入り）
  let finalUseColor = finalRecruitData.panelColor ? finalRecruitData.panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000');
  finalUseColor = normalizeHex(finalUseColor, '000000');
  const updatedImageBuffer = await generateRecruitCard(finalRecruitData, [interaction.user.id], interaction.client, finalUseColor);
  const updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });
  const finalAccentColor = /^[0-9A-Fa-f]{6}$/.test(finalUseColor) ? parseInt(finalUseColor, 16) : 0x000000;
  const footerExtra = finalRecruitData.expiresAt ? `締切: ${formatJST(finalRecruitData.expiresAt)}` : null;
  const updatedContainer = buildContainer({ headerTitle: `${user.username}さんの募集`, participantText, recruitIdText: actualRecruitId, accentColor: finalAccentColor, imageAttachmentName: 'attachment://recruit-card.png', recruiterId: interaction.user.id, requesterId: interaction.user.id, footerExtra });
  try { await actualMessage.edit({ files: [updatedImage], components: [updatedContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } }); } catch (editError) { console.error('メッセージ更新エラー:', editError); }

  // 自動締切タイマー（指定期限 or 8h）
  const eightHoursMs = 8 * 60 * 60 * 1000;
  const expireDelay = Math.min(computeDelayMs(finalRecruitData.expiresAt, eightHoursMs), eightHoursMs);
  setTimeout(async () => {
    try {
      if (recruitParticipants.has(actualMessageId)) {
        console.log('期限到来による自動締切実行:', actualMessageId);
        try { await autoCloseRecruitment(interaction.client, interaction.guildId, interaction.channelId, actualMessageId); } catch (e) { console.error('autoCloseRecruitment failed:', e); }
      }
    } catch (error) { console.error('自動締切処理でエラー:', error); }
  }, expireDelay);

  // 開始時刻メンション（任意）
  const startDelay = computeDelayMs(finalRecruitData.startAt, null);
  if (startDelay !== null && startDelay >= 0 && startDelay <= (36 * 60 * 60 * 1000)) { // 36h上限
    setTimeout(async () => {
      try {
        if (!recruitParticipants.has(actualMessageId)) return; // 既に終了
        const ids = await getParticipantsFromRedis(actualMessageId).catch(() => null) || recruitParticipants.get(actualMessageId) || [];
        if (!Array.isArray(ids) || ids.length === 0) return;
        const mentions = ids.map(id => `<@${id}>`).join(' ');
        let content = `⏰ 開始時刻になりました！ ${mentions}`;
        if (finalRecruitData.voice === true) {
          if (finalRecruitData.voicePlace) content += `\n🔊 ボイスチャット: ${finalRecruitData.voicePlace}`;
          else content += `\n🔊 ボイスチャット: あり`;
        } else if (finalRecruitData.voice === false) {
          content += `\n🔇 ボイスチャット: なし`;
        }
        await interaction.channel.send({ content, allowedMentions: { users: ids } }).catch(() => {});
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
          // 満員通知（初回のみ）
          try {
            if (participants.length >= (savedRecruitData.participants || Infinity)) {
              if (!fullNotifySent.has(messageId)) {
                fullNotifySent.add(messageId);
                await recruiterUser?.send?.({ content: `🎉 募集が満員になりました！\nタイトル: ${savedRecruitData.title || ''}\n人数: ${participants.length}/${savedRecruitData.participants}` }).catch(() => {});
              }
            }
          } catch (_) {}
        } catch (e) { console.warn('background recruiter notify failed:', e?.message || e); }
      })();
    }
  } else {
    await safeReply(interaction, { content: '❌ 既に参加済みです。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
  }
  updateParticipantList(interaction, participants, savedRecruitData).catch(e => console.warn('updateParticipantList failed (async):', e?.message || e));
}

async function processCancel(interaction, messageId, participants, savedRecruitData) {
  const beforeLength = participants.length;
  if (savedRecruitData && savedRecruitData.recruiterId === interaction.user.id) {
    await safeReply(interaction, { content: '❌ 募集主は参加をキャンセルできません。募集を締める場合は「締め」ボタンを使用してください。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
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
    await safeReply(interaction, { content: '❌ 参加していないため、取り消せません。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
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
      await safeReply(interaction, { content: '❌ 募集データが見つからないため締め切れません。', flags: MessageFlags.Ephemeral });
      return;
    }
    if (data.recruiterId !== interaction.user.id) {
      await safeReply(interaction, { content: '❌ 締め切りを実行できるのは募集主のみです。', flags: MessageFlags.Ephemeral });
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

    // Disable UI (Components v2)
    const disabledContainer = new (require('discord.js').ContainerBuilder)();
    disabledContainer.setAccentColor(0x808080);
    const originalMessage = interaction.message;
    disabledContainer.addTextDisplayComponents(
      new (require('discord.js').TextDisplayBuilder)().setContent('🎮✨ **募集締め切り済み** ✨🎮')
    );
    disabledContainer.addSeparatorComponents(
      new (require('discord.js').SeparatorBuilder)().setSpacing(require('discord.js').SeparatorSpacingSize.Small).setDivider(true)
    );
    disabledContainer.addMediaGalleryComponents(
      new (require('discord.js').MediaGalleryBuilder)().addItems(
        new (require('discord.js').MediaGalleryItemBuilder)().setURL(originalMessage.attachments.first()?.url || 'attachment://recruit-card.png')
      )
    );
    disabledContainer.addSeparatorComponents(
      new (require('discord.js').SeparatorBuilder)().setSpacing(require('discord.js').SeparatorSpacingSize.Small).setDivider(true)
    ).addTextDisplayComponents(
      new (require('discord.js').TextDisplayBuilder)().setContent('🔒 **この募集は締め切られました** 🔒')
    );
    const footerMessageId = interaction.message.interaction?.id || interaction.message.id;
    disabledContainer.addSeparatorComponents(
      new (require('discord.js').SeparatorBuilder)().setSpacing(require('discord.js').SeparatorSpacingSize.Small).setDivider(true)
    ).addTextDisplayComponents(
      new (require('discord.js').TextDisplayBuilder)().setContent(`募集ID：\`${footerMessageId.slice(-8)}\` | powered by **rectbot**`)
    );
    await interaction.message.edit({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });

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
    } else {
      await safeReply(interaction, { content: '🔒 募集を締め切りました。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
    }
  } catch (e) {
    console.error('close button handler error:', e);
  }
}

async function handleModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  console.log('[handleModalSubmit] started for guild:', interaction.guildId, 'user:', interaction.user?.id);

  if (interaction.customId !== 'recruitModal') {
    console.log('[handleModalSubmit] ignored customId:', interaction.customId);
    return;
  }

  try {
    // 前処理: クールダウンと同時募集制限
    if (!(await enforceCooldown(interaction))) return;
    if (!(await ensureNoActiveRecruit(interaction))) return;

    const guildSettings = await getGuildSettings(interaction.guildId);

    // pending からスラッシュ引数を取得
    const pending = interaction.user && interaction.user.id ? pendingModalOptions.get(interaction.user.id) : null;
    if (!pending) {
      await safeReply(interaction, { content: '❌ 内部エラー: 一時データが見つかりません。最初からやり直してください。', flags: MessageFlags.Ephemeral });
      return;
    }

    const participantsNum = parseInt(pending.participants);
    if (isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
      await safeReply(interaction, { content: '❌ 参加人数は1〜16の範囲で指定してください。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
      return;
    }

    // 色決定: pending > interaction > settings > default
    let panelColor = undefined;
    if (typeof pending.panelColor === 'string' && pending.panelColor.length > 0) panelColor = pending.panelColor;
    else if (typeof interaction.recruitPanelColor === 'string' && interaction.recruitPanelColor.length > 0) panelColor = interaction.recruitPanelColor;
    else if (guildSettings.defaultColor) panelColor = guildSettings.defaultColor;

    // VC 表示文言
    let vcText = '指定なし';
    if (pending.voice === true) vcText = pending.voicePlace ? pending.voicePlace : 'あり';
    else if (pending.voice === false) vcText = 'なし';

    const recruitDataObj = {
      title: pending.title,
      content: interaction.fields.getTextInputValue('content'), // モーダルは内容のみ
      participants: participantsNum,
      startTime: pending.startTime,
      startAt: pending.startAt || null,
      expiresAt: pending.expiresAt || null,
      deadlineHours: pending.deadlineHours || null,
      voice: typeof pending.voice === 'boolean' ? pending.voice : null,
      voicePlace: pending.voicePlace || null,
      vc: vcText,
      recruiterId: interaction.user.id,
      recruitId: '',
      panelColor
    };
    // 通知ロールの決定
    const configuredNotificationRoleIds = buildConfiguredNotificationRoleIds(guildSettings);
    const { roleId: selectedNotificationRole, aborted } = await selectNotificationRole(interaction, configuredNotificationRoleIds);
    if (aborted) return;
    recruitDataObj.notificationRoleId = selectedNotificationRole;

    // カード生成と初回送信
    const currentParticipants = [interaction.user.id];
    let useColor = normalizeHex(panelColor ? panelColor : (guildSettings.defaultColor ? guildSettings.defaultColor : '000000'), '000000');
    const buffer = await generateRecruitCard(recruitDataObj, currentParticipants, interaction.client, useColor);
    const user = interaction.targetUser || interaction.user;

    const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
    let participantText = `🎯✨ 参加リスト ✨🎯\n🎮 <@${interaction.user.id}>`;
    if (selectedNotificationRole) participantText += `\n🔔 通知ロール: <@&${selectedNotificationRole}>`;
    const panelColorForAccent = normalizeHex(panelColor, guildSettings.defaultColor && /^[0-9A-Fa-f]{6}$/.test(guildSettings.defaultColor) ? guildSettings.defaultColor : '000000');
    const accentColor = /^[0-9A-Fa-f]{6}$/.test(panelColorForAccent) ? parseInt(panelColorForAccent, 16) : 0x000000;
    const footerExtra = recruitDataObj.expiresAt ? `締切: ${formatJST(recruitDataObj.expiresAt)}` : null;
    const container = buildContainer({ headerTitle: `${user.username}さんの募集`, participantText, recruitIdText: '(送信後決定)', accentColor, imageAttachmentName: 'attachment://recruit-card.png', recruiterId: interaction.user.id, requesterId: interaction.user.id, footerExtra });
    const followUpMessage = await sendAnnouncements(interaction, selectedNotificationRole, configuredNotificationRoleIds, image, container, guildSettings);
    try { await safeReply(interaction, { content: '募集を作成しました。', flags: MessageFlags.Ephemeral }); } catch (e) { console.warn('safeReply failed (non-fatal):', e?.message || e); }
    // 送信後の保存とUI更新
    try {
      await finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, user, participantText, followUpMessage });
    } catch (error) { console.error('メッセージ取得エラー:', error); }

    // pending はここで破棄（消費済み）
    try { if (interaction.user && interaction.user.id) pendingModalOptions.delete(interaction.user.id); } catch (_) {}
  } catch (error) {
    console.error('handleModalSubmit error:', error);
    if (error && error.code === 10062) return; // Unknown interaction
    if (!interaction.replied && !interaction.deferred) {
      try { await safeReply(interaction, { content: `モーダル送信エラー: ${error.message || error}`, flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } }); } catch (e) { console.error('二重応答防止: safeReply failed', e); }
    } else {
      try { await safeReply(interaction, { content: `モーダル送信エラー: ${error.message || error}` }); } catch (e) { console.error('safeReply(edit) failed', e); }
    }
  }
}

async function handleButton(interaction) {
  const messageId = interaction.message.id;
  console.log('=== ボタンクリック処理開始 ===', messageId, interaction.customId);

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
