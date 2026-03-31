/**
 * UI準備モジュール
 * 募集作成時のUIコンポーネント準備
 */

const { AttachmentBuilder } = require('discord.js');
const { generateRecruitCardQueued } = require('../../../utils/imageQueue');
const { buildContainerSimple, buildContainer } = require('../../../utils/recruitHelpers');
const { normalizeHex } = require('../ui/message-updater');
const { buildVoiceLabel, buildDetailsText, buildExtraCreateVCButtons, buildSubHeaderText } = require('../ui/text-builders');
const { fetchUserAvatarUrl } = require('../data/data-loader');

const CREATE_IMAGE_TIMEOUT_MS = Number(process.env.RECRUIT_CREATE_IMAGE_TIMEOUT_MS || 900);

async function withTimeout(promise, timeoutMs, timeoutMessage) {
  return await Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs))
  ]);
}

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
 * 画像生成を同期的に行う（タイムアウト最適化）
 */
async function prepareUIComponentsForCreate(recruitDataObj, interaction, guildSettings) {
  const currentParticipants = [interaction.user.id, ...recruitDataObj.existingMembers.filter(id => id !== interaction.user.id)];
  const user = interaction.targetUser || interaction.user;
  let style = guildSettings?.recruit_style === 'simple' ? 'simple' : 'image';
  const useColor = normalizeHex(recruitDataObj.panelColor || guildSettings.defaultColor || '000000', '000000');

  let image = null;
  const forceTemplateImage = Boolean(recruitDataObj?.templateName || recruitDataObj?.template);
  
  // Image スタイルの場合、画像を生成してみる（タイムアウトまたはエラー時はスキップ）
  if (style === 'image') {
    try {
      console.log('[prepareUIComponentsForCreate] Generating recruitment image...');
      const buffer = await withTimeout(
        generateRecruitCardQueued(recruitDataObj, currentParticipants, interaction.client, useColor),
        CREATE_IMAGE_TIMEOUT_MS,
        `recruit create image timed out (${CREATE_IMAGE_TIMEOUT_MS}ms)`
      );
      image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
      console.log('[prepareUIComponentsForCreate] Image generated successfully');
    } catch (e) {
      if (forceTemplateImage) {
        console.error('[prepareUIComponentsForCreate] Template image generation failed (no simple fallback):', e?.message || e);
        throw e;
      }
      console.warn('[prepareUIComponentsForCreate] Image generation failed, falling back to text:', e?.message || e);
      // 通常の /rect は従来どおり text スタイルにフォールバック
      style = 'simple';
    }
  }

  const remainingSlots = recruitDataObj.participants - currentParticipants.length;
  const participantText = `**📋 参加リスト** \`(あと${remainingSlots}人)\`\n${currentParticipants.map(id => `<@${id}>`).join(' • ')}`;

  const subHeaderText = buildSubHeaderText(recruitDataObj.notificationRoleId);
  const accentColor = buildAccentColor(recruitDataObj.panelColor, guildSettings.defaultColor);

  // 画像が成功した場合のみ Image コンテナ、そうでなければ Simple コンテナ
  const container = !image
    ? await buildSimpleContainerForCreate(recruitDataObj, interaction, user, participantText, subHeaderText, accentColor, '(作成中)')
    : buildImageContainerForCreate(recruitDataObj, interaction, participantText, subHeaderText, accentColor, '(作成中)');

  return { image, container, participantText, subHeaderText, accentColor, currentParticipants, user, style, useColor };
}

module.exports = {
  buildAccentColor,
  buildSimpleContainerForCreate,
  buildImageContainerForCreate,
  prepareUIComponentsForCreate
};
