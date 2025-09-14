
const {
  ChatInputCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  ButtonStyle,
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
      // 取り消しボタン
      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('取り消し')
        .setStyle(ButtonStyle.Secondary);
      // 締めボタン
      const closeButton = new ButtonBuilder()
        .setCustomId('close')
        .setLabel('締め')
        .setStyle(ButtonStyle.Danger);

      // セクション（タイトル＋説明、参加者リスト＋参加ボタン）
      const sectionTop = new SectionBuilder()
        .addTextDisplayComponents([titleText, descText]);
      const sectionBottom = new SectionBuilder()
        .addTextDisplayComponents([memberText])
        .setButtonAccessory(joinButton);

      // ボタン群（下部に配置）
      sectionBottom.addButtonAccessory(cancelButton);
      sectionBottom.addButtonAccessory(closeButton);

      // コンテナ
      const container = new ContainerBuilder()
        .addSectionComponents([sectionTop, sectionBottom]);

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
      console.log('Components v2 sent successfully');
    } catch (error) {
      console.error('Components v2 failed:', error);
      await interaction.reply({
        content: 'エラー: Components v2の送信に失敗しました。',
        ephemeral: true
      });
    }
  },
};
