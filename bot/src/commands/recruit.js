
const {
  ChatInputCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new ChatInputCommandBuilder()
    .setName('recruit')
    .setDescription('募集用のEmbedとボタンを送信します'),

  async execute(interaction) {
    // Components v2 安定実装
    try {
      // 参加者リスト（初期は空）
      const memberList = '参加者なし';

      // タイトル・説明・参加者リスト
      const titleText = new TextDisplayBuilder().setContent('🎮 ゲーム募集');
      const descText = new TextDisplayBuilder().setContent('参加ボタンを押して募集に参加してください。');
      const memberText = new TextDisplayBuilder().setContent(`**参加者 (0人)**\n${memberList}`);

      // 参加ボタン
      const joinButton = new ButtonBuilder()
        .setCustomId('join')
        .setLabel('参加')
        .setStyle(ButtonStyle.Success);

      // セクション1: タイトルと説明のみ
      const sectionTop = new SectionBuilder()
        .addTextDisplayComponents([titleText, descText]);

      // セクション2: 参加者リストと参加ボタン
      const sectionBottom = new SectionBuilder()
        .addTextDisplayComponents([memberText])
        .setButtonAccessory(joinButton);

      // 取り消し・締めボタン用のActionRow（従来方式）
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('取り消し')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('close')
            .setLabel('締め')
            .setStyle(ButtonStyle.Danger)
        );

      // コンテナ
      const container = new ContainerBuilder()
        .addSectionComponents([sectionTop, sectionBottom]);

      await interaction.reply({
        components: [container, actionRow],
        flags: MessageFlags.IsComponentsV2
      });
      console.log('Components v2 sent successfully');
    } catch (error) {
      console.error('Components v2 failed:', error);
      console.error('Full error:', error);
      
      // フォールバック: 従来のEmbed + Buttons
      console.log('Using fallback Embed + Buttons');
      const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
      
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
