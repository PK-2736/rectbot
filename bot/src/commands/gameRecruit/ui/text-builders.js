/**
 * テキスト・ラベル構築ユーティリティ
 * 募集パネルの各種テキスト要素を生成
 */

const { ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * 音声（VC）表示ラベルを構築
 */
function buildVoiceLabel(vcValue, voicePlace) {
  if (vcValue === 'あり(聞き専)') {
    return voicePlace ? `🎙 聞き専/${voicePlace}` : '🎙 聞き専';
  }
  if (vcValue === 'あり') {
    return voicePlace ? `🎙 あり/${voicePlace}` : '🎙 あり';
  }
  if (vcValue === 'なし') {
    return '🎙 なし';
  }
  return null;
}

/**
 * 詳細テキスト行を構築（開始時間、募集人数、通話有無）
 */
function buildDetailsText(startTime, participants, voiceLabel) {
  const startLabel = startTime ? `🕒 ${startTime}` : null;
  const membersLabel = typeof participants === 'number' ? `👥 ${participants}人` : null;
  const valuesLine = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  return [labelsLine, valuesLine].filter(Boolean).join('\n');
}

/**
 * Simpleスタイル用の詳細テキストを構築
 */
function buildSimpleDetailsText(finalRecruitData) {
  const labelsLine = '**🕒 開始時間 | 👥 募集人数 | 🎙 通話有無**';
  const startVal = finalRecruitData?.startTime ? String(finalRecruitData.startTime) : null;
  const membersVal = typeof finalRecruitData?.participants === 'number' ? `${finalRecruitData.participants}人` : null;
  const voiceVal = mapVoiceValue(finalRecruitData);
  const valuesLine = [startVal, membersVal, voiceVal].filter(Boolean).join(' | ');
  return `${labelsLine}\n${valuesLine}`;
}

/**
 * 音声フィールドの値をマッピング
 */
function mapVoiceValue(finalRecruitData) {
  if (typeof finalRecruitData?.vc !== 'string') return null;
  if (finalRecruitData.vc === 'あり(聞き専)') return '🎙 聞き専';
  if (finalRecruitData.vc === 'あり') return '🎙 あり';
  if (finalRecruitData.vc === 'なし') return '🎙 なし';
  return null;
}

/**
 * 募集内容テキストを構築
 */
function buildContentText(finalRecruitData) {
  const contentTextValue = finalRecruitData?.content || finalRecruitData?.note || finalRecruitData?.description || '';
  return (contentTextValue && String(contentTextValue).trim().length > 0)
    ? `**📝 募集内容**\n${String(contentTextValue).slice(0, 1500)}`
    : '';
}

/**
 * サブヘッダーテキストを構築（通知ロール表示）
 */
function buildSubHeaderText(notificationRoleId) {
  if (!notificationRoleId) return '';
  if (notificationRoleId === 'everyone') return '🔔 通知ロール: @everyone';
  if (notificationRoleId === 'here') return '🔔 通知ロール: @here';
  return `🔔 通知ロール: <@&${notificationRoleId}>`;
}

/**
 * 専用チャンネル作成ボタンを構築（「今から」の場合のみ）
 */
function buildExtraCreateVCButtons(startTime, recruitId) {
  if (startTime !== '今から') return [];
  
  return [
    new ButtonBuilder()
      .setCustomId(`create_vc_${recruitId}`)
      .setLabel('専用チャンネル作成')
      .setEmoji('📢')
      .setStyle(ButtonStyle.Primary)
  ];
}

/**
 * 開始時刻用のVCボタンを構築
 */
function buildStartVCButton(actualRecruitId, finalRecruitData) {
  if (finalRecruitData?.startTime !== '今から') return [];
  return [
    new ButtonBuilder()
      .setCustomId(`create_vc_${actualRecruitId}`)
      .setLabel('専用チャンネル作成')
      .setEmoji('📢')
      .setStyle(ButtonStyle.Primary)
  ];
}

module.exports = {
  buildVoiceLabel,
  buildDetailsText,
  buildSimpleDetailsText,
  mapVoiceValue,
  buildContentText,
  buildSubHeaderText,
  buildExtraCreateVCButtons,
  buildStartVCButton
};
