/**
 * ui-text-helpers.js
 * UI テキスト構築と表示ロジック
 */

/**
 * 音声チャンネル設定をラベル化
 * Dictionary-based pattern matching で複雑度削減
 */
function buildVoiceLabel(vcValue, voicePlace) {
  if (!vcValue) return 'なし';
  
  const VOICE_MODES = {
    'なし': { label: 'なし', placeable: false },
    'none': { label: 'なし', placeable: false },
    'あり': { label: 'あり', placeable: true },
    'required': { label: 'あり', placeable: true },
    '任意': { label: '任意', placeable: true },
    'optional': { label: '任意', placeable: true },
    'あり(聞き専)': { label: '聞き専', placeable: true }
  };
  
  const mode = VOICE_MODES[vcValue];
  if (!mode) return vcValue; // fallback
  
  const label = mode.label;
  return (mode.placeable && voicePlace) ? `${label}/${voicePlace}` : label;
}

/**
 * 募集詳細行を構築（開始時間、人数、通話）
 */
function buildRecruitDetailsLine(recruitData) {
  const startLabel = recruitData?.startTime ? `🕒 ${recruitData.startTime}` : null;
  const totalMembers = recruitData?.participants ?? recruitData?.participant_count;
  const membersLabel = totalMembers ? `👥 ${totalMembers}人` : null;
  const voiceLabel = buildVoiceLabel(recruitData?.vc, recruitData?.voicePlace);
  
  const detailsLine = [startLabel, membersLabel, voiceLabel].filter(Boolean).join(' | ');
  return detailsLine;
}

/**
 * 最終参加者テキストを構築
 * participantsList が渡されない場合はキャッシュから取得
 */
function buildFinalParticipantText(messageId, recruitData, participantsList) {
  // Cache access for testing - will use recruitParticipants from state if available
  let finalParticipants = participantsList || [];
  
  if (finalParticipants.length === 0) {
    try {
      const { recruitParticipants } = require('../data/state');
      finalParticipants = recruitParticipants.get(messageId) || [];
    } catch (e) {
      console.warn('buildFinalParticipantText: Failed to get from cache:', e?.message || e);
    }
  }
  
  const totalMembers = recruitData?.participants ?? recruitData?.participant_count;
  const totalSlots = totalMembers || finalParticipants.length;
  return `📋 参加リスト (最終 ${finalParticipants.length}/${totalSlots}人)\n${finalParticipants.map(id => `<@${id}>`).join(' • ')}`;
}

/**
 * 募集締切表示テキストを構築
 */
function buildClosedRecruitText(recruitData, messageId) {
  const lines = [];
  
  lines.push('🎮✨ **募集締め切り済み** ✨🎮');
  
  if (recruitData?.title) {
    lines.push(`📌 タイトル\n${String(recruitData.title).slice(0, 200)}`);
  }
  
  const detailsLine = buildRecruitDetailsLine(recruitData);
  if (detailsLine) {
    lines.push(detailsLine);
  }
  
  if (recruitData?.content?.trim()) {
    lines.push(`📝 募集内容\n${String(recruitData.content).slice(0, 1500)}`);
  }
  
  lines.push('🔒 **この募集は締め切られました** 🔒');
  
  const recruitIdText = `募集ID：\`${String(messageId).slice(-8)}\` | powered by **Recrubo**`;
  lines.push(recruitIdText);
  
  return lines;
}

module.exports = {
  buildVoiceLabel,
  buildRecruitDetailsLine,
  buildFinalParticipantText,
  buildClosedRecruitText
};
