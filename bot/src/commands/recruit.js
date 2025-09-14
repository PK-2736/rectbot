const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setDescription('募集用のEmbedとボタンを送信します'),
  
  async execute(interaction) {
    console.log('Using stable Embed + Buttons implementation');
    
    // 安定したEmbed + Buttons実装
    const embed = new EmbedBuilder()
      .setTitle('🎮 ゲーム募集')
      .setDescription('参加ボタンを押して募集に参加してください。')
      .addFields({
        name: '参加者 (0人)',
        value: '参加者なし',
        inline: false
      })
      .setColor(0x5865f2);

    const row = new ActionRowBuilder()
      .addComponents(
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

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    console.log('Embed + Buttons sent successfully');
  },
};
