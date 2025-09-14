const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setDescription('募集用のEmbedとボタンを送信します'),
  
  async execute(interaction) {
    // Components v2 の利用可能性をチェック
    const hasComponentsV2 = typeof ContainerBuilder !== 'undefined' && 
                           typeof SectionBuilder !== 'undefined' &&
                           typeof TextDisplayBuilder !== 'undefined';

    if (hasComponentsV2) {
      // Components v2 を使用してEmbedの中にボタンを実装
      const container = new ContainerBuilder()
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents([
              new TextDisplayBuilder({
                content: '# 🎮 ゲーム募集'
              }),
              new TextDisplayBuilder({
                content: '参加ボタンを押して募集に参加してください。'
              })
            ])
        )
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents([
              new TextDisplayBuilder({
                content: '**参加者 (0人)**\n参加者なし'
              })
            ])
            .setButtonAccessory(
              new ButtonBuilder()
                .setCustomId('join')
                .setLabel('参加')
                .setStyle(ButtonStyle.Success)
            )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('cancel')
              .setLabel('取り消し')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('close')
              .setLabel('締め')
              .setStyle(ButtonStyle.Danger)
          )
        )
        .setAccentColor(0x5865f2);

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      // フォールバック：従来のEmbed + Buttons
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
    }
  },
};
