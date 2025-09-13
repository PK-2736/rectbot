const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { generateRecruitImage } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setDescription('募集テストのEmbedとボタンを送信します'),
  async execute(interaction) {
    // Canvasで“ボタン風UI”を描いた画像をEmbedに表示（視覚的にEmbed内に見せる）
    const imageBuffer = await generateRecruitImage({ title: '募集テスト' });
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'recruit.png' });

    const embed = new EmbedBuilder()
      .setTitle('募集テスト')
      .setDescription('下のボタンで参加・取り消し・締めができます')
      .setImage('attachment://recruit.png');

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

    await interaction.reply({ embeds: [embed], components: [row], files: [attachment] });
  },
};
