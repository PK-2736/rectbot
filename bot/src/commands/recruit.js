
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
    // Components v2 詳細API調査と安定実装
    try {
      console.log('=== Components v2 API Investigation ===');
      
      // 各Builderクラスの利用可能メソッドを詳細調査
      const sectionBuilder = new SectionBuilder();
      const textBuilder = new TextDisplayBuilder();
      const buttonBuilder = new ButtonBuilder();
      
      console.log('SectionBuilder methods:', Object.getOwnPropertyNames(SectionBuilder.prototype));
      console.log('TextDisplayBuilder methods:', Object.getOwnPropertyNames(TextDisplayBuilder.prototype));
      console.log('ButtonBuilder methods:', Object.getOwnPropertyNames(ButtonBuilder.prototype));
      
      // TextDisplayBuilderの設定
      const titleText = new TextDisplayBuilder();
      if (typeof titleText.setContent === 'function') {
        titleText.setContent('🎮 ゲーム募集');
      } else if (typeof titleText.setText === 'function') {
        titleText.setText('🎮 ゲーム募集');
      } else if (typeof titleText.setLabel === 'function') {
        titleText.setLabel('🎮 ゲーム募集');
      }
      
      const descText = new TextDisplayBuilder();
      if (typeof descText.setContent === 'function') {
        descText.setContent('参加ボタンを押して募集に参加してください。');
      } else if (typeof descText.setText === 'function') {
        descText.setText('参加ボタンを押して募集に参加してください。');
      } else if (typeof descText.setLabel === 'function') {
        descText.setLabel('参加ボタンを押して募集に参加してください。');
      }
      
      const memberText = new TextDisplayBuilder();
      if (typeof memberText.setContent === 'function') {
        memberText.setContent('**参加者 (0人)**\n参加者なし');
      } else if (typeof memberText.setText === 'function') {
        memberText.setText('**参加者 (0人)**\n参加者なし');
      } else if (typeof memberText.setLabel === 'function') {
        memberText.setLabel('**参加者 (0人)**\n参加者なし');
      }

      // SectionBuilderに単純にTextDisplayを追加（ボタンなし）
      const section1 = new SectionBuilder();
      if (typeof section1.addTextDisplayComponents === 'function') {
        section1.addTextDisplayComponents([titleText, descText]);
      } else if (typeof section1.setTextDisplayComponents === 'function') {
        section1.setTextDisplayComponents([titleText, descText]);
      } else if (typeof section1.addComponents === 'function') {
        section1.addComponents(titleText, descText);
      }
      
      const section2 = new SectionBuilder();
      if (typeof section2.addTextDisplayComponents === 'function') {
        section2.addTextDisplayComponents([memberText]);
      } else if (typeof section2.setTextDisplayComponents === 'function') {
        section2.setTextDisplayComponents([memberText]);
      } else if (typeof section2.addComponents === 'function') {
        section2.addComponents(memberText);
      }

      // ContainerBuilder
      const container = new ContainerBuilder();
      if (typeof container.addSectionComponents === 'function') {
        container.addSectionComponents([section1, section2]);
      } else if (typeof container.setSectionComponents === 'function') {
        container.setSectionComponents([section1, section2]);
      } else if (typeof container.addComponents === 'function') {
        container.addComponents(section1, section2);
      }

      // 全ボタンは従来のActionRowで安全に配置
      const actionRow = new ActionRowBuilder()
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
        components: [container, actionRow],
        flags: MessageFlags.IsComponentsV2
      });
      console.log('Components v2 (text only) + ActionRow sent successfully');
      
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
