/**
 * UI準備モジュール
 * 募集作成時のUIコンポーネント準備
 */

const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { generateRecruitCardQueued } = require('../../../utils/imageQueue');
const { buildContainerSimple, buildContainer } = require('../../../utils/recruitHelpers');
const { normalizeHex } = require('../ui/message-updater');
const { buildVoiceLabel, buildDetailsText, buildExtraCreateVCButtons, buildSubHeaderText } = require('../ui/text-builders');
const { fetchUserAvatarUrl } = require('../data/data-loader');

/**
 * アクセントカラーを構築（パネル色 → デフォルト色）
 */
function buildAccentColor(panelColor, defaultColor) {
  const useColor = normalizeHex(panelColor, defaultColor && /^[0-9A-Fa-f]{6}$/.test(defaultColor) ? defaultColor : '000000');
  return /^[0-9A-Fa-f]{6}$/.test(useColor) ? parseInt(useColor, 16) : 0x000000;
}

/**
 * Simpleスタイルコンテナを構築（作成時）
 */
async function buildSimpleContainerForCreate(recruitDataObj, interaction, user, participantText, subHeaderText, accentColor, recruitId) {
  const voiceLabel = buildVoiceLabel(recruitDataObj.vc, recruitDataObj.voicePlace);
  const detailsText = buildDetailsText(recruitDataObj.startTime, recruitDataObj.participants, voiceLabel);
  
  const contentText = recruitDataObj.content && String(recruitDataObj.content).trim().length > 0
    ? `**📝 募集内容**\n${String(recruitDataObj.content).slice(0, 1500)}`
    : '';
  
  const titleText = recruitDataObj.title ? `## ${String(recruitDataObj.title).slice(0, 200)}` : '';
  const avatarUrl = await fetchUserAvatarUrl(interaction);
  const extraButtons = buildExtraCreateVCButtons(recruitDataObj.startTime, recruitId);
  
  return buildContainerSimple({
    headerTitle: `${user.username}さんの募集`,
    detailsText,
    contentText,
    titleText,
    participantText,
    recruitIdText: recruitId,
    accentColor,
    subHeaderText,
    avatarUrl,
    extraActionButtons: extraButtons
  });
}

/**
 * Imageスタイルコンテナを構築（作成時）
 */
function buildImageContainerForCreate(recruitDataObj, interaction, participantText, subHeaderText, accentColor, recruitId) {
  const extraButtons = buildExtraCreateVCButtons(recruitDataObj.startTime, recruitId);
  
  return buildContainer({
    headerTitle: `${interaction.user.username}さんの募集`,
    subHeaderText,
    contentText: '',
    titleText: '',
    participantText,
    recruitIdText: recruitId,
    accentColor,
    imageAttachmentName: 'attachment://recruit-card.png',
    recruiterId: interaction.user.id,
    requesterId: interaction.user.id,
    extraActionButtons: extraButtons
  });
}

/**
 * UIコンポーネントを準備（全体フロー）
 * 画像生成は非同期で実行（タイムアウト防止）
 */
async function prepareUIComponentsForCreate(recruitDataObj, interaction, guildSettings) {
  const currentParticipants = [interaction.user.id, ...recruitDataObj.existingMembers.filter(id => id !== interaction.user.id)];
  const user = interaction.targetUser || interaction.user;
  const style = guildSettings?.recruit_style === 'simple' ? 'simple' : 'image';
  const useColor = normalizeHex(recruitDataObj.panelColor || guildSettings.defaultColor || '000000', '000000');

  // ※ 画像生成はスキップ - 非同期で後から実行する
  let image = null;

  const remainingSlots = recruitDataObj.participants - currentParticipants.length;
  const participantText = `**📋 参加リスト** \`(あと${remainingSlots}人)\`\n${currentParticipants.map(id => `<@${id}>`).join(' • ')}`;

  const subHeaderText = buildSubHeaderText(recruitDataObj.notificationRoleId);
  const accentColor = buildAccentColor(recruitDataObj.panelColor, guildSettings.defaultColor);

  const container = style === 'simple'
    ? await buildSimpleContainerForCreate(recruitDataObj, interaction, user, participantText, subHeaderText, accentColor, '(作成中)')
    : buildImageContainerForCreate(recruitDataObj, interaction, participantText, subHeaderText, accentColor, '(作成中)');

  return { image, container, participantText, subHeaderText, accentColor, currentParticipants, user, style, useColor };
}

/**
 * 画像を非同期で生成して更新（fire-and-forget）
 */
function generateAndUpdateImageAsync(recruitDataObj, currentParticipants, interaction, style, useColor, followUpMessage, guildSettings) {
  if (style !== 'image' || !followUpMessage?.id) return;

  (async () => {
    try {
      console.log('[generateAndUpdateImageAsync] Starting image generation...');
      const buffer = await generateRecruitCardQueued(recruitDataObj, currentParticipants, interaction.client, useColor);
      const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });

      // メッセージを更新
      const extraButtons = buildExtraCreateVCButtons(recruitDataObj.startTime, String(followUpMessage.id).slice(-8));
      const updatedContainer = buildContainer({
        headerTitle: `${interaction.user.username}さんの募集`,
        subHeaderText: buildSubHeaderText(recruitDataObj.notificationRoleId),
        contentText: '',
        titleText: '',
        participantText: `**📋 参加リスト** \`(あと${recruitDataObj.participants - currentParticipants.length}人)\`\n${currentParticipants.map(id => `<@${id}>`).join(' • ')}`,
        recruitIdText: String(followUpMessage.id).slice(-8),
        accentColor: buildAccentColor(recruitDataObj.panelColor, guildSettings.defaultColor),
        imageAttachmentName: 'attachment://recruit-card.png',
        recruiterId: interaction.user.id,
        requesterId: interaction.user.id,
        extraActionButtons: extraButtons
      });

      await followUpMessage.edit({
        components: [updatedContainer],
        files: [image],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { roles: [], users: [] }
      });
      console.log('[generateAndUpdateImageAsync] Image update complete');
    } catch (e) {
      console.error('[generateAndUpdateImageAsync] Failed:', e?.message || e);
      // エラーSilent - メッセージは既に送信済み
    }
  })();
}

module.exports = {
  buildAccentColor,
  buildSimpleContainerForCreate,
  buildImageContainerForCreate,
  prepareUIComponentsForCreate,
  generateAndUpdateImageAsync
};
