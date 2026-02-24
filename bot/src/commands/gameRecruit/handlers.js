/**
 * handlers.js - メインハンドラーファイル（簡素化版）
 * モーダル送信とボタンインタラクションのオーケストレーター
 */

const { MessageFlags } = require('discord.js');
const { processJoin, processCancel, processClose } = require('./actions/buttonActions');
const { processCreateDedicatedChannel } = require('./channels/dedicatedChannelHandler');
const { hydrateParticipants, loadSavedRecruitData } = require('./data/data-loader');
const { validateModalSubmission } = require('./flows/modal-submit-flow');
const { buildRecruitDataFromModal } = require('./flows/modal-data-extractor');

// UI準備モジュールの関数をインポート（後で作成予定）
const { prepareUIComponentsForCreate } = require('./ui/ui-preparation');
const { sendRecruitmentAnnouncementsFlow } = require('./notifications/announcement-flow');
const { finalizeMessageAndUIFlow } = require('./ui/message-finalization');
const { finalizePersistAndEdit } = require('./flows/modal-submit-flow');

/**
 * モーダル送信エラーをハンドリング
 */
function handleModalSubmitError(interaction, error) {
  const { safeReply } = require('../../utils/safeReply');
  if (!interaction.replied && !interaction.deferred) {
    try {
      safeReply(interaction, {
        content: `モーダル送信エラー: ${error.message || error}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
    } catch (e) {
      console.error('二重応答防止: safeReply failed', e);
    }
  } else {
    try {
      interaction.editReply({ content: `❌ モーダル送信エラー: ${error.message || error}` });
    } catch (e) {
      console.error('editReply failed', e);
    }
  }
}

/**
 * メインモーダル送信ハンドラー
 */
async function handleModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (interaction.customId !== 'recruitModal') return;

  try {
    // ステップ1: 検証
    const guildSettings = await validateModalSubmission(interaction);
    if (!guildSettings) return;

    // ステップ2: データ構築
    const recruitDataObj = await buildRecruitDataFromModal(interaction, guildSettings);

    // ステップ3: UI準備
    const uiData = await prepareUIComponentsForCreate(recruitDataObj, interaction, guildSettings);

    // ステップ4: アナウンス送信
    const { followUpMessage, secondaryMessage } = await sendRecruitmentAnnouncementsFlow(
      interaction,
      recruitDataObj,
      guildSettings,
      uiData
    );
    if (!followUpMessage?.id) return;

    // ステップ5: メッセージとUI確定
    await finalizeMessageAndUIFlow(interaction, followUpMessage, secondaryMessage, {
      recruitDataObj,
      guildSettings,
      ...uiData
    });

    // ステップ6: 最終化と永続化
    await finalizePersistAndEdit({
      interaction,
      recruitDataObj,
      guildSettings,
      user: uiData.user,
      participantText: uiData.participantText,
      subHeaderText: uiData.subHeaderText,
      followUpMessage,
      currentParticipants: uiData.currentParticipants
    });

    // 完了
    try {
      await interaction.deleteReply();
    } catch (e) {
      console.warn('[handleModalSubmit] Failed to delete deferred reply:', e?.message || e);
    }
  } catch (error) {
    console.error('handleModalSubmit error:', error);
    if (error?.code === 10062) return;
    await handleModalSubmitError(interaction, error);
  }
}

/**
 * メインボタンクリックハンドラー
 */
async function handleButton(interaction) {
  const messageId = interaction.message.id;

  // 専用チャンネル作成ボタン
  if (interaction.customId.startsWith('create_vc_') || interaction.customId === 'create_vc_pending') {
    let recruitId = interaction.customId.replace('create_vc_', '');
    if (!recruitId || recruitId === 'pending') {
      recruitId = String(messageId).slice(-8);
    }
    if (recruitId) {
      await processCreateDedicatedChannel(interaction, recruitId);
      return;
    }
  }

  // 参加者データの復元
  const participants = await hydrateParticipants(interaction, messageId);
  const savedRecruitData = await loadSavedRecruitData(interaction, messageId);

  // アクション処理
  const action = interaction.customId;
  if (action === 'join') {
    await processJoin(interaction, messageId, participants, savedRecruitData);
  } else if (action === 'cancel') {
    await processCancel(interaction, messageId, participants, savedRecruitData);
  } else if (action === 'close') {
    await processClose(interaction, messageId, savedRecruitData);
  }
}

module.exports = { handleModalSubmit, handleButton };
