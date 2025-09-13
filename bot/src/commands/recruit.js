const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setDescription('募集テストのEmbedとボタンを送信します'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('募集テスト')
      .setDescription('下のボタンで参加・取り消し・締めができます');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('join')
        .setLabel('参加')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('取り消し')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('close')
        .setLabel('締め')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
