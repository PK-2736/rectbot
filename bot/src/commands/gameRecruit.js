const {
  SlashCommandBuilder,
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags
} = require('discord.js');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamerecruit')
    .setDescription('ゲーム募集を作成します'),
  async execute(interaction) {
    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("## ゲーム募集\n以下の操作を選択してください。")
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("join")
            .setLabel("参加")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("cancel")
            .setLabel("取り消し")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("close")
            .setLabel("締め")
            .setStyle(ButtonStyle.Secondary)
        )
      );

    // 画像ファイルのパス（例: bot/src/assets/game.png）
    const imagePath = path.join(__dirname, '../../images/boshu.png');

    await interaction.reply({
      content: ' ',
      files: [{ attachment: imagePath, name: 'boshu.png' }],
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  },

  // ボタンインタラクションの処理
  async handleButton(interaction) {
    switch (interaction.customId) {
      case "join":
        await interaction.reply({ content: "✅ 参加しました！", ephemeral: true });
        break;
      case "cancel":
        await interaction.reply({ content: "❌ 取り消しました。", ephemeral: true });
        break;
      case "close":
        await interaction.reply({ content: "🔒 締め切りました。", ephemeral: true });
        break;
    }
  }
};
