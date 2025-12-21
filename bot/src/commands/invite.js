const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('公式サーバーの招待リンクと、ボットのワンタイム招待リンクを発行・表示します'),

  async execute(interaction) {
    const OFFICIAL_INVITE = 'https://discord.com/oauth2/authorize?client_id=1048950201974542477';

    try {
      const embed = new EmbedBuilder()
        .setTitle('Recrubo 招待リンク')
        .setDescription('以下のリンクから公式サーバーに参加したり、ボットを招待できます。')
        .addFields(
          { name: '🔗 公式サーバー', value: OFFICIAL_INVITE },
          { name: '🤖 ボット招待リンク', value: OFFICIAL_INVITE }
        )
        .setColor(0xF97316);

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('公式サーバーに参加').setStyle(ButtonStyle.Link).setURL(OFFICIAL_INVITE),
        new ButtonBuilder().setLabel('ボットを招待').setStyle(ButtonStyle.Link).setURL(OFFICIAL_INVITE)
      );

      await safeReply(interaction, { embeds: [embed], components: [buttonRow], flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('[invite] command execution failed:', e?.message || e);
      try { await safeReply(interaction, { content: '❌ 招待リンクの表示に失敗しました。', flags: MessageFlags.Ephemeral }); } catch (_) {}
    }
  }
};
