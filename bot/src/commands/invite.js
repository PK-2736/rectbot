const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const backendFetch = require('../utils/backendFetch');
const { safeReply } = require('../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('公式サーバーの招待リンクと、ボットのワンタイム招待リンクを発行・表示します'),

  async execute(interaction) {
    const OFFICIAL_INVITE = 'https://discord.gg/tJAGc9aRdc';

    try {

      // Generate one-time bot invite via backend worker
  let resp;
      try {
        resp = await backendFetch('/api/bot-invite/one-time', { method: 'POST' });
      } catch (err) {
        const status = err?.status;
        if (status === 401) {
          await safeReply(interaction, { content: '❌ 招待URLを発行できません（認証エラー）。管理者に連絡してください。', flags: MessageFlags.Ephemeral });
          return;
        }
        console.error('[invite] backend fetch failed:', err?.message || err);
        await safeReply(interaction, { content: '❌ 招待URLの発行に失敗しました。しばらくして再試行してください。', flags: MessageFlags.Ephemeral });
        return;
      }

      if (!resp?.ok || !resp?.url) {
        await safeReply(interaction, { content: '❌ 招待URLの発行に失敗しました。しばらくして再試行してください。', flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
          .setTitle('Recrubo 招待リンク')
        .setDescription('以下のリンクから公式サーバーに参加したり、サーバーにボットを招待できます（ワンタイムリンク）。')
        .addFields(
          { name: '🔗 公式サーバー', value: OFFICIAL_INVITE },
          { name: '🤖 ワンタイム招待リンク', value: resp.url }
        )
          .setColor(0xF97316);

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('公式サーバーに参加').setStyle(ButtonStyle.Link).setURL(OFFICIAL_INVITE),
        new ButtonBuilder().setLabel('ボットを招待（ワンタイム）').setStyle(ButtonStyle.Link).setURL(resp.url)
      );

      await safeReply(interaction, { embeds: [embed], components: [buttonRow], flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('[invite] command execution failed:', e?.message || e);
      try { await safeReply(interaction, { content: '❌ 招待リンクの表示に失敗しました。', flags: MessageFlags.Ephemeral }); } catch (_) {}
    }
  }
};
