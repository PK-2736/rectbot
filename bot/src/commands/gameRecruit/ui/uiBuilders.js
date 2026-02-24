const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

function buildSimpleStyleContainer(actualRecruitId, finalRecruitData, user, participantText, subHeaderText, finalAccentColor, avatarUrl) {
  const { buildContainerSimple } = require('../../utils/recruitHelpers');
  const detailsText = buildSimpleDetailsText(finalRecruitData);
  const contentText = buildContentText(finalRecruitData);
  const extraButtonsFinalSimple = buildStartVCButton(actualRecruitId, finalRecruitData);

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
    extraActionButtons: extraButtonsFinalSimple
  });
}

function buildImageStyleContainer(actualRecruitId, finalRecruitData, user, participantText, subHeaderText, finalAccentColor, _avatarUrl) {
  const { buildContainer } = require('../../utils/recruitHelpers');
  const contentText = buildContentText(finalRecruitData);
  const extraButtonsFinalImg = buildStartVCButton(actualRecruitId, finalRecruitData);

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
    extraActionButtons: extraButtonsFinalImg
  });
}

function buildSimpleDetailsText(finalRecruitData) {
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  const startVal = finalRecruitData?.startTime ? String(finalRecruitData.startTime) : null;
  const membersVal = typeof finalRecruitData?.participants === 'number' ? `${finalRecruitData.participants}人` : null;
  const voiceVal = mapVoiceValue(finalRecruitData);
  const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
  return `${labelsLine}\n${valuesLine}`;
}

function mapVoiceValue(finalRecruitData) {
  if (typeof finalRecruitData?.vc !== 'string') return null;
  if (finalRecruitData.vc === 'あり(聞き専)') return finalRecruitData?.voicePlace ? `聞き専/${finalRecruitData.voicePlace}` : '聞き専';
  if (finalRecruitData.vc === 'あり') return finalRecruitData?.voicePlace ? `あり/${finalRecruitData.voicePlace}` : 'あり';
  if (finalRecruitData.vc === 'なし') return 'なし';
  return null;
}

function buildContentText(finalRecruitData) {
  const contentTextValue = finalRecruitData?.content || finalRecruitData?.note || finalRecruitData?.description || '';
  return (contentTextValue && String(contentTextValue).trim().length > 0)
    ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}`
    : '';
}

function buildStartVCButton(actualRecruitId, finalRecruitData) {
  if (finalRecruitData?.startTime !== '今から') return [];
  return [new ButtonBuilder().setCustomId(`create_vc_${actualRecruitId}`).setLabel('専用チャンネル作成').setEmoji('📢').setStyle(ButtonStyle.Primary)];
}

function buildStartVCButtonRow(actualRecruitId, finalRecruitData) {
  const buttons = buildStartVCButton(actualRecruitId, finalRecruitData);
  return buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons[0])] : [];
}

module.exports = {
  buildSimpleStyleContainer,
  buildImageStyleContainer,
  buildSimpleDetailsText,
  mapVoiceValue,
  buildContentText,
  buildStartVCButton,
  buildStartVCButtonRow
};
