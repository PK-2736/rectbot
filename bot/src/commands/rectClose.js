const { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, MessageFlags, ComponentType } = require('discord.js');
const { listRecruitsFromRedis, getParticipantsFromRedis } = require('../utils/db');
const { autoCloseRecruitment } = require('../utils/recruitMessage');
const { safeReply } = require('../utils/safeReply');

function buildRecruitOptions(recruits, guildId) {
  const opts = [];
  for (const r of recruits) {
    try {
      const gid = String(r?.guildId ?? r?.guild_id ?? r?.metadata?.guildId ?? '');
      const status = String(r?.status ?? '').toLowerCase();
      if (gid !== String(guildId)) continue;
      if (status && !(status === 'recruiting' || status === 'active')) continue;
      const label = (r?.title ? String(r.title).slice(0, 100) : '募集') + ` (${String(r?.recruitId || '').slice(0,8)})`;
      const value = String(r?.message_id || r?.messageId || r?.metadata?.messageId || r?.recruitId || '');
      if (!value) continue;
      opts.push(new StringSelectMenuOptionBuilder().setLabel(label).setValue(value));
    } catch (_) {}
  }
  return opts.slice(0, 25);
}

module.exports = {
  data: new SlashCommandBuilder().setName('rect-close').setDescription('既存の募集を参加者が締める（〆）'),
  noDefer: false,
  async execute(interaction) {
    const all = await listRecruitsFromRedis().catch(() => []);
    const options = buildRecruitOptions(all || [], interaction.guildId);
    if (options.length === 0) {
      await safeReply(interaction, { content: 'このサーバーに〆可能な募集はありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('rect_close_select')
      .setPlaceholder('〆する募集を選択')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(select);
    await safeReply(interaction, { content: '募集の〆対象を選んでください。', components: [row], flags: MessageFlags.Ephemeral });
  },

  async handleSelectMenu(interaction) {
    try {
      if (!interaction.values || interaction.values.length === 0) {
        await interaction.update({ content: '募集の選択が見つかりませんでした。', components: [], flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      const messageId = String(interaction.values[0]);
      // 参加者取得
      let participants = await getParticipantsFromRedis(messageId).catch(() => null);
      if (!Array.isArray(participants)) participants = [];

      const isParticipant = participants.includes(interaction.user.id);
      if (!isParticipant) {
        await interaction.update({ content: '❌ この募集の参加者のみが〆できます。', components: [], flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }

      // クローズ実行（既存の共通ロジックを使用）
      await interaction.update({ content: '🔒 〆を実行しました。メッセージを更新しています…', components: [], flags: MessageFlags.Ephemeral }).catch(() => {});
      // 対象募集のチャンネルIDを取得
      let channelId = interaction.channelId;
      try {
        const all = await listRecruitsFromRedis().catch(() => []);
        const target = (all || []).find(r => String(r?.message_id || r?.messageId || '') === messageId || String(r?.recruitId || '') === messageId.slice(-8));
        if (target && (target.channelId || target.metadata?.channelId)) {
          channelId = String(target.channelId || target.metadata.channelId);
        }
      } catch (_) {}
      try {
        await autoCloseRecruitment(interaction.client, interaction.guildId, channelId, messageId);
      } catch (e) {
        await safeReply(interaction, { content: `〆処理中にエラーが発生しました: ${e?.message || e}`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    } catch (err) {
      await safeReply(interaction, { content: `選択処理でエラー: ${err?.message || err}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
};
