const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { listRecruitsFromRedis, getParticipantsFromRedis } = require('../utils/db');
const { autoCloseRecruitment } = require('../utils/recruitMessage');
const { safeReply } = require('../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rect_close')
    .setDescription('既存の募集を参加者が締める（〆）')
    .addStringOption(option =>
      option.setName('募集')
        .setDescription('締める募集を選択')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  noDefer: false,

  async autocomplete(interaction) {
    try {
      const all = await listRecruitsFromRedis().catch(() => []);
      const options = await buildUserRecruitOptions(all, interaction.guildId, interaction.user.id);
      await interaction.respond(options.slice(0, 25));
    } catch (err) {
      console.error('[rect-close autocomplete]', err);
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction) {
    const messageId = interaction.options.getString('募集');
    if (!messageId) {
      await safeReply(interaction, { content: '❌ 募集が選択されていません。', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const participants = await fetchParticipants(messageId);
      if (!participants.includes(interaction.user.id)) {
        await safeReply(interaction, { content: '❌ この募集の参加者のみが〆できます。', flags: MessageFlags.Ephemeral });
        return;
      }

      const all = await listRecruitsFromRedis().catch(() => []);
      const target = findRecruitByMessageId(all, messageId);
      const recruitTitle = getRecruitTitle(target);
      const channelId = getRecruitChannelId(target, interaction.channelId);

      await autoCloseRecruitment(interaction.client, interaction.guildId, channelId, messageId);
      await safeReply(interaction, {
        content: `🔒 **${recruitTitle}** の募集を締めました。`,
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error('[rect-close execute]', err);
      await safeReply(interaction, { 
        content: `❌ 〆処理中にエラーが発生しました: ${err?.message || err}`, 
        flags: MessageFlags.Ephemeral 
      });
    }
  }
};

async function fetchParticipants(messageId) {
  const participants = await getParticipantsFromRedis(messageId).catch(() => null);
  return Array.isArray(participants) ? participants : [];
}

function findRecruitByMessageId(all, messageId) {
  return (all || []).find(r =>
    String(r?.message_id || r?.messageId || '') === messageId ||
    String(r?.recruitId || '') === messageId.slice(-8)
  );
}

function getRecruitTitle(target) {
  if (target?.title) {
    return String(target.title).slice(0, 100);
  }
  return '募集';
}

function getRecruitChannelId(target, fallbackChannelId) {
  if (target && (target.channelId || target.metadata?.channelId)) {
    return String(target.channelId || target.metadata.channelId);
  }
  return fallbackChannelId;
}

function buildRecruitLabel(recruit) {
  const title = recruit?.title ? String(recruit.title).slice(0, 80) : '募集';
  const id = String(recruit?.recruitId || '').slice(0, 8);
  return `${title} (ID: ${id})`;
}

async function buildUserRecruitOptions(all, guildId, userId) {
  const userRecruits = [];
  for (const r of all || []) {
    try {
      const gid = String(r?.guildId ?? r?.guild_id ?? r?.metadata?.guildId ?? '');
      const status = String(r?.status ?? '').toLowerCase();
      if (gid !== String(guildId)) continue;
      if (status && !(status === 'recruiting' || status === 'active')) continue;

      const messageId = String(r?.message_id || r?.messageId || r?.metadata?.messageId || '');
      if (!messageId) continue;

      const participants = await fetchParticipants(messageId);
      if (!participants.includes(userId)) continue;

      userRecruits.push({
        name: buildRecruitLabel(r),
        value: messageId
      });
    } catch (_) {}
  }
  return userRecruits;
}
