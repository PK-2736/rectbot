/**
 * モーダル送信フローモジュール
 * handleModalSubmitの主要なワークフロー処理
 */

const { MessageFlags, EmbedBuilder, ActionRowBuilder } = require('discord.js');
const { recruitParticipants, pendingModalOptions, startNotifySent } = require('../data/state');
const { safeReply } = require('../../../utils/safeReply');
const { createErrorEmbed } = require('../../../utils/embedHelpers');
const { getGuildSettings, saveRecruitToRedis, saveParticipantsToRedis, setCooldown, getParticipantsFromRedis } = require('../utils/database');
const { EXEMPT_GUILD_IDS } = require('../data/constants');
const { hexToIntColor } = require('../actions/buttonActions');
const { createFinalRecruitData, fetchUserAvatarUrl } = require('../data/data-loader');
const { buildStartVCButton } = require('../ui/text-builders');
const { normalizeHex, updateMessageWithStyle } = require('../ui/message-updater');

/** 満員DMの重複送信防止 */
const _fullNotifySent = new Set();

/**
 * ギルドが除外対象かチェック
 */
function isGuildExempt(guildId) {
  return EXEMPT_GUILD_IDS.has(String(guildId));
}

/**
 * クールダウンを強制
 */
async function enforceCooldown(interaction) {
  const { getCooldownRemaining } = require('../utils/database');
  try {
    if (isGuildExempt(interaction.guildId)) return true;
    const remaining = await getCooldownRemaining(`rect:${interaction.guildId}`);
    if (remaining > 0) {
      const mm = Math.floor(remaining / 60);
      const ss = remaining % 60;
      await safeReply(interaction, {
        content: `⏳ このサーバーの募集コマンドはクールダウン中です。あと ${mm}:${ss.toString().padStart(2, '0')} 待ってから再度お試しください。`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[rect cooldown check] failed:', e?.message || e);
    return true;
  }
}

/**
 * アクティブな募集がないことを確認
 */
async function ensureNoActiveRecruit(interaction) {
  if (isGuildExempt(interaction.guildId)) return true;
  const { listRecruitsFromRedis } = require('../utils/database');
  try {
    const allRecruits = await listRecruitsFromRedis();
    const guildIdStr = String(interaction.guildId);
    if (Array.isArray(allRecruits)) {
      const guildRecruit = allRecruits.find(r => r && (String(r.guildId) === guildIdStr || String(r.guild_id) === guildIdStr) && r.status !== 'closed');
      if (guildRecruit) {
        await safeReply(interaction, {
          content: '❌ このサーバーには既に進行中の募集があります。締め切るか完了してから新しい募集を作成してください。',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return false;
      }
    }
    return true;
  } catch (e) {
    console.warn('listRecruitsFromRedis failed:', e?.message || e);
    return true;
  }
}

/**
 * 参加人数をモーダルからパース
 */
function parseParticipantsNumFromModal(interaction) {
  const pending = interaction.user?.id ? pendingModalOptions.get(interaction.user.id) : null;
  const participantsNum = pending?.participants;
  
  if (!participantsNum || isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
    return null;
  }
  return participantsNum;
}

/**
 * モーダル送信を検証
 */
async function validateModalSubmission(interaction) {
  if (!(await enforceCooldown(interaction))) return null;
  if (!(await ensureNoActiveRecruit(interaction))) return null;
  
  const guildSettings = await getGuildSettings(interaction.guildId);
  const participantsNum = parseParticipantsNumFromModal(interaction);
  
  if (participantsNum === null) {
    await safeReply(interaction, {
      embeds: [createErrorEmbed('参加人数は1〜16の数字で入力してください。', '入力エラー')],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return null;
  }
  
  return guildSettings;
}

/**
 * Webhook通知を送信
 */
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

/**
 * 募集データを保存
 */
async function shouldSaveRecruitData(finalRecruitData, actualRecruitId, _interaction) {
  try {
    await saveRecruitToRedis(actualRecruitId, finalRecruitData);
    console.log(`[Redis] 募集保存成功: ${actualRecruitId}`);
  } catch (err) {
    console.error('[Redis] 募集保存失敗:', err?.message || err);
  }
}

/**
 * 初期化＆永続化処理
 */
async function initializeAndPersistData(actualRecruitId, actualMessageId, recruitDataObj, interaction, currentParticipants, user, avatarUrl) {
  const finalRecruitData = createFinalRecruitData(actualRecruitId, actualMessageId, recruitDataObj, interaction);

  await shouldSaveRecruitData(finalRecruitData, actualRecruitId, interaction);
  await sendWebhookNotification(finalRecruitData, interaction, actualRecruitId, actualMessageId, avatarUrl);

  recruitParticipants.set(actualMessageId, currentParticipants);
  try {
    await saveParticipantsToRedis(actualMessageId, currentParticipants);
  } catch (e) {
    console.warn('初期参加者のRedis保存に失敗:', e?.message || e);
  }
}

/**
 * 時刻遅延を計算
 */
function computeDelayMs(targetTime, now = null) {
  if (!targetTime) return null;
  const target = new Date(targetTime).getTime();
  const current = now ? new Date(now).getTime() : Date.now();
  return target - current;
}

/**
 * 開始時刻通知Embedを構築
 */
function buildStartNotificationEmbed(finalRecruitData, mentions, interaction, notifyColor) {
  const notifyEmbed = new EmbedBuilder()
    .setColor(notifyColor)
    .setTitle('⏰ 開始時刻になりました！')
    .setDescription(`**${finalRecruitData.title}** の募集開始時刻です。`)
    .addFields({ name: '📋 参加者', value: mentions, inline: false })
    .setTimestamp();

  if (finalRecruitData.voice === true) {
    const voiceText = finalRecruitData.voicePlace ? `あり (${finalRecruitData.voicePlace})` : 'あり';
    notifyEmbed.addFields({ name: '🔊 ボイスチャット', value: voiceText, inline: false });
  } else if (finalRecruitData.voice === false) {
    notifyEmbed.addFields({ name: '🔇 ボイスチャット', value: 'なし', inline: false });
  }

  if (finalRecruitData.voiceChannelId) {
    const voiceUrl = `https://discord.com/channels/${interaction.guildId}/${finalRecruitData.voiceChannelId}`;
    notifyEmbed.addFields({ name: '🔗 ボイスチャンネル', value: `[参加する](${voiceUrl})`, inline: false });
  }

  const recruitUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.message?.id || ''}`;
  notifyEmbed.addFields({ name: '📋 募集の詳細', value: `[メッセージを確認](${recruitUrl})`, inline: false });

  return notifyEmbed;
}

/**
 * 開始通知Embedを送信
 */
async function sendStartNotificationEmbed(ids, finalRecruitData, guildSettings, interaction, actualRecruitId) {
  const mentions = ids.map(id => `<@${id}>`).join(' ');
  const notifyColor = hexToIntColor(finalRecruitData?.panelColor || '00FF00', 0x00FF00);
  const notifyEmbed = buildStartNotificationEmbed(finalRecruitData, mentions, interaction, notifyColor);
  
  const components = guildSettings?.enable_dedicated_channel
    ? [new ActionRowBuilder().addComponents(buildStartVCButton(actualRecruitId, finalRecruitData)[0])]
    : [];

  const sendOptions = { content: mentions, embeds: [notifyEmbed], components, allowedMentions: { users: ids } };
  await interaction.channel.send(sendOptions).catch(() => {});
}

/**
 * 開始時刻通知をセットアップ
 */
function setupStartTimeNotification(actualRecruitId, actualMessageId, finalRecruitData, guildSettings, interaction) {
  const startDelay = computeDelayMs(finalRecruitData.startAt, null);
  if (finalRecruitData.startTime === '今から' || startDelay === null || startDelay < 0 || startDelay > (36 * 60 * 60 * 1000)) return;

  setTimeout(async () => {
    try {
      if (startNotifySent.has(actualRecruitId)) return;
      startNotifySent.add(actualRecruitId);

      if (!recruitParticipants.has(actualMessageId)) return;
      const ids = await getParticipantsFromRedis(actualMessageId).catch(() => null) || recruitParticipants.get(actualMessageId) || [];
      if (!Array.isArray(ids) || ids.length === 0) return;

      await sendStartNotificationEmbed(ids, finalRecruitData, guildSettings, interaction, actualRecruitId);
    } catch (e) {
      console.warn('開始通知送信失敗:', e?.message || e);
    }
  }, startDelay);
}

/**
 * 最終化＆永続化処理（finalizePersistAndEdit）
 */
async function finalizePersistAndEdit({ interaction, recruitDataObj, guildSettings, user, participantText, subHeaderText, followUpMessage, currentParticipants }) {
  const actualMessage = followUpMessage;
  const actualMessageId = actualMessage.id;
  const actualRecruitId = actualMessageId.slice(-8);
  const avatarUrl = await fetchUserAvatarUrl(interaction);

  // ステップ1: 最終データの初期化と永続化
  await initializeAndPersistData(actualRecruitId, actualMessageId, recruitDataObj, interaction, currentParticipants, user, avatarUrl);

  // ステップ2: 最終データの取得と色の正規化
  const finalRecruitData = createFinalRecruitData(actualRecruitId, actualMessageId, recruitDataObj, interaction);
  const finalUseColor = normalizeHex(finalRecruitData.panelColor || guildSettings.defaultColor || '000000', '000000');
  const finalAccentColor = /^[0-9A-Fa-f]{6}$/.test(finalUseColor) ? parseInt(finalUseColor, 16) : 0x000000;

  // ステップ3: スタイル別コンテナの生成と送信
  const styleForEdit = (guildSettings?.recruit_style === 'simple') ? 'simple' : 'image';
  await updateMessageWithStyle(actualMessage, actualRecruitId, styleForEdit, finalRecruitData, guildSettings, user, participantText, subHeaderText, finalUseColor, finalAccentColor, avatarUrl, interaction);

  // ステップ4: 開始時刻通知の設定
  setupStartTimeNotification(actualRecruitId, actualMessageId, finalRecruitData, guildSettings, interaction);

  // ステップ5: クールダウン設定
  try {
    if (!isGuildExempt(interaction.guildId)) {
      await setCooldown(`rect:${interaction.guildId}`, 60);
    }
  } catch (e) {
    console.warn('[rect cooldown set at submit] failed:', e?.message || e);
  }
}

module.exports = {
  isGuildExempt,
  enforceCooldown,
  ensureNoActiveRecruit,
  parseParticipantsNumFromModal,
  validateModalSubmission,
  sendWebhookNotification,
  shouldSaveRecruitData,
  initializeAndPersistData,
  computeDelayMs,
  buildStartNotificationEmbed,
  sendStartNotificationEmbed,
  setupStartTimeNotification,
  finalizePersistAndEdit
};
