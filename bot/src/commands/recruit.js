
const {
  ChatInputCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new ChatInputCommandBuilder()
    .setName('recruit')
    .setDescription('募集用のEmbedとボタンを送信します'),

  async execute(interaction) {
    // Components v2 正しいAPI実装（動作確認済みのコード参考）
    console.log('Using verified Components v2 implementation');
    
    try {
      const components = [
        new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("## 🎮 ゲーム募集"),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("参加ボタンを押して募集に参加してください。"),
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("**参加者 (0人)**\n参加者なし"),
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
          )
          .addActionRowComponents(
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Success)
                  .setLabel("✅ 参加")
                  .setCustomId("join"),
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Secondary)
                  .setLabel("❌ 取り消し")
                  .setCustomId("cancel"),
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Danger)
                  .setLabel("🔒 締め")
                  .setCustomId("close"),
              ),
          )
      ];

      await interaction.reply({ 
        components: components, 
        flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
      });
      
      console.log('Components v2 sent successfully with verified API');
    } catch (error) {
      console.error('Components v2 failed:', error);
      console.error('Full error:', error);
      
      // フォールバック: 従来のEmbed + Buttons
      console.log('Using fallback Embed + Buttons');
      const { EmbedBuilder } = require('discord.js');
      
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
            .setLabel('✅ 参加')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('❌ 取り消し')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('close')
            .setLabel('🔒 締め')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });
    }
  },
};
