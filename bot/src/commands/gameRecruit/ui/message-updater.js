/**
 * メッセージ更新モジュール
 * 募集メッセージの編集・スタイル更新
 */

const { MessageFlags, AttachmentBuilder } = require('discord.js');
const { generateRecruitCardQueued } = require('../../../utils/imageQueue');
const { buildContainerSimple, buildContainer } = require('../../../utils/recruitHelpers');
const { buildSimpleDetailsText, buildContentText, buildStartVCButton } = require('../ui/text-builders');

/**
 * HEX文字列を正規化（#を除去し、6桁チェック）
 */
function normalizeHex(color, fallback = 'FFFFFF') {
  let use = color;
  if (typeof use === 'string' && use.startsWith('#')) use = use.slice(1);
  if (typeof use !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(use)) return fallback;
  return use;
}

/**
 * Simpleスタイルコンテナを構築（最終確定版）
 */
function buildSimpleStyleContainer(actualRecruitId, finalRecruitData, user, participantText, subHeaderText, finalAccentColor, avatarUrl) {
  const detailsText = buildSimpleDetailsText(finalRecruitData);
  const contentText = buildContentText(finalRecruitData);
  const extraButtons = buildStartVCButton(actualRecruitId, finalRecruitData);

  return buildContainerSimple({
    headerTitle: `${user.username}さんの募集`,
    detailsText,
    contentText,
    titleText: finalRecruitData?.title ? `## ${String(finalRecruitData.title).slice(0, 200)}` : '',
    participantText,
    recruitIdText: actualRecruitId,
    accentColor: finalAccentColor,
    subHeaderText,
    avatarUrl,
    extraActionButtons: extraButtons
  });
}

/**
 * Imageスタイルコンテナを構築（最終確定版）
 */
function buildImageStyleContainer(actualRecruitId, finalRecruitData, user, participantText, subHeaderText, finalAccentColor, _avatarUrl) {
  const contentText = buildContentText(finalRecruitData);
  const extraButtons = buildStartVCButton(actualRecruitId, finalRecruitData);

  return buildContainer({
    headerTitle: `${user.username}さんの募集`,
    subHeaderText,
    contentText,
    titleText: '',
    participantText,
    recruitIdText: actualRecruitId,
    accentColor: finalAccentColor,
    imageAttachmentName: 'attachment://recruit-card.png',
    recruiterId: user.id,
    requesterId: user.id,
    extraActionButtons: extraButtons
  });
}

/**
 * スタイル別にメッセージを更新
 */
async function updateMessageWithStyle(actualMessage, actualRecruitId, styleForEdit, finalRecruitData, guildSettings, user, participantText, subHeaderText, finalUseColor, finalAccentColor, avatarUrl, interaction) {
  let updatedContainer;
  let updatedImage = null;

  // Image style: 画像を生成
  if (styleForEdit === 'image') {
    const updatedImageBuffer = await generateRecruitCardQueued(finalRecruitData, [], interaction.client, finalUseColor);
    updatedImage = new AttachmentBuilder(updatedImageBuffer, { name: 'recruit-card.png' });
  }

  // コンテナ構築
  updatedContainer = styleForEdit === 'simple'
    ? buildSimpleStyleContainer(actualRecruitId, finalRecruitData, user, participantText, subHeaderText, finalAccentColor, avatarUrl)
    : buildImageStyleContainer(actualRecruitId, finalRecruitData, user, participantText, subHeaderText, finalAccentColor, avatarUrl);

  // メッセージ編集
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

/**
 * メッセージとUIを確定（セカンダリメッセージの更新も含む）
 */
async function finalizeMessageAndUI(interaction, followUpMessage, secondaryMessage, options) {
  const { recruitDataObj: _recruitDataObj, _guildSettings, container, image, participantText: _participantText, subHeaderText: _subHeaderText, accentColor: _accentColor, style, _useColor, user: _user } = options;
  
  const _recruitId = followUpMessage.id.slice(-8);
  
  try {
    // メイン/セカンダリメッセージ更新（必要な場合）
    if (container && (style === 'simple' || style === 'image')) {
      const updatePayload = {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { roles: [], users: [] }
      };
      if (image) updatePayload.files = [image];
      
      await followUpMessage.edit(updatePayload).catch(e => console.warn('メイン最終化失敗:', e?.message || e));
      if (secondaryMessage) {
        await secondaryMessage.edit(updatePayload).catch(e => console.warn('セカンダリ最終化失敗:', e?.message || e));
      }
    }
  } catch (e) {
    console.warn('finalizeMessageAndUI failed:', e?.message || e);
  }
}

module.exports = {
  normalizeHex,
  buildSimpleStyleContainer,
  buildImageStyleContainer,
  updateMessageWithStyle,
  finalizeMessageAndUI
};
