const { EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../../../utils/database');

function normalizeHex(hexStr) {
  if (!hexStr || typeof hexStr !== 'string') return null;
  const cleaned = hexStr.replace(/^#/, '').trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) return null;
  return `#${cleaned}`;
}

async function resolvePanelColor(guildId) {
  try {
    const settings = await getGuildSettings(guildId);
    const raw = settings?.panel_color ?? settings?.panelColor;
    if (raw) {
      const normalized = normalizeHex(raw);
      if (normalized) {
        return parseInt(normalized.slice(1), 16);
      }
    }
  } catch (error) {
    console.warn('[resolvePanelColor] failed:', error?.message || error);
  }
  return 0x5865f2;
}

function mapVoiceValue(voiceRaw) {
  if (voiceRaw === 'none') return 'なし';
  if (voiceRaw === 'required') return '必須';
  if (voiceRaw === 'optional') return '任意';
  return voiceRaw || 'なし';
}

function buildVoiceLabel(voiceValue) {
  if (voiceValue === 'なし' || voiceValue === 'none') return 'なし';
  if (voiceValue === '必須' || voiceValue === 'required') return '必須';
  if (voiceValue === '任意' || voiceValue === 'optional') return '任意';
  return voiceValue;
}

function buildSubHeaderText(startAt, recruitData) {
  const game = recruitData.metadata?.game;
  const rank = recruitData.metadata?.rank;
  const comment = recruitData.metadata?.comment;

  let sub = '';
  if (startAt) {
    const friendlyTime = `<t:${Math.floor(startAt / 1000)}:t>`;
    sub += `🕐 開始: ${friendlyTime}\n`;
  }
  if (game) sub += `🎮 ゲーム: ${game}\n`;
  if (rank) sub += `🏆 ランク: ${rank}\n`;
  if (comment) sub += `💬 コメント: ${comment}\n`;

  return sub.trim();
}

function buildSimpleDetailsText(recruitData) {
  const voice = buildVoiceLabel(recruitData.metadata?.voice);
  const current = recruitData.participants?.length || 0;
  const max = recruitData.metadata?.participantsNum || 0;
  return `👥 参加者: ${current}/${max}\n🎤 VC: ${voice}`;
}

function buildContentText(mainText, detailText) {
  return `${mainText || ''}\n\n${detailText || ''}`.trim();
}

async function buildAccentColor(recruitData) {
  const guildId = recruitData?.guildId;
  if (!guildId) return 0x5865f2;
  return await resolvePanelColor(guildId);
}

function buildStartNotificationEmbed(recruitData) {
  const title = recruitData.metadata?.title || '募集';
  const game = recruitData.metadata?.game || 'ゲーム';
  
  const embed = new EmbedBuilder()
    .setTitle(`🔔 募集開始時刻です！`)
    .setDescription(`**${title}** (${game})`)
    .setColor(0xffa500)
    .setTimestamp();

  const participants = recruitData.participants || [];
  if (participants.length > 0) {
    const mentions = participants.map(p => `<@${p.userId}>`).join(' ');
    embed.addFields({ name: '参加者', value: mentions, inline: false });
  }

  return embed;
}

module.exports = {
  normalizeHex,
  resolvePanelColor,
  mapVoiceValue,
  buildVoiceLabel,
  buildSubHeaderText,
  buildSimpleDetailsText,
  buildContentText,
  buildAccentColor,
  buildStartNotificationEmbed
};
