const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

// Components v2の実験的インポート（dev版用）
let ComponentsV2Available = false;
let ContainerBuilder, SectionBuilder, TextDisplayBuilder, MessageFlags;

try {
  // discord.js dev版のComponents v2を試行
  const { 
    ContainerBuilder: CB, 
    SectionBuilder: SB, 
    TextDisplayBuilder: TDB,
    MessageFlags: MF
  } = require('discord.js');
  
  if (CB && SB && TDB && MF) {
    ContainerBuilder = CB;
    SectionBuilder = SB;
    TextDisplayBuilder = TDB;
    MessageFlags = MF;
    ComponentsV2Available = true;
    console.log('Components v2 successfully loaded');
  }
} catch (error) {
  console.log('Components v2 not available in this discord.js version');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setDescription('募集用のEmbedとボタンを送信します'),
  
  async execute(interaction) {
    console.log('Attempting Components v2:', ComponentsV2Available);

    if (ComponentsV2Available) {
      try {
        // Components v2実装（dev版API調査）
        console.log('Testing different API methods...');
        
        // Method 1: 基本的な構築
        const container = new ContainerBuilder();
        const section1 = new SectionBuilder();
        const section2 = new SectionBuilder();
        const textDisplay1 = new TextDisplayBuilder();
        const textDisplay2 = new TextDisplayBuilder();
        const textDisplay3 = new TextDisplayBuilder();
        
        console.log('Available methods on TextDisplayBuilder:', Object.getOwnPropertyNames(TextDisplayBuilder.prototype));
        console.log('Available methods on SectionBuilder:', Object.getOwnPropertyNames(SectionBuilder.prototype));
        console.log('Available methods on ContainerBuilder:', Object.getOwnPropertyNames(ContainerBuilder.prototype));
        
        // テキスト設定（複数のメソッドを試行）
        if (typeof textDisplay1.setContent === 'function') {
          textDisplay1.setContent('🎮 ゲーム募集');
          textDisplay2.setContent('参加ボタンを押して募集に参加してください。');
          textDisplay3.setContent('**参加者 (0人)**\n参加者なし');
        } else if (typeof textDisplay1.setText === 'function') {
          textDisplay1.setText('🎮 ゲーム募集');
          textDisplay2.setText('参加ボタンを押して募集に参加してください。');
          textDisplay3.setText('**参加者 (0人)**\n参加者なし');
        }

        const joinButton = new ButtonBuilder()
          .setCustomId('join')
          .setLabel('参加')
          .setStyle(ButtonStyle.Success);

        // セクション構築（複数のメソッドを試行）
        if (typeof section1.addTextDisplayComponents === 'function') {
          section1.addTextDisplayComponents([textDisplay1, textDisplay2]);
          section2.addTextDisplayComponents([textDisplay3]).setButtonAccessory(joinButton);
        } else if (typeof section1.setTextDisplayComponents === 'function') {
          section1.setTextDisplayComponents([textDisplay1, textDisplay2]);
          section2.setTextDisplayComponents([textDisplay3]).setButtonAccessory(joinButton);
        } else if (typeof section1.addComponents === 'function') {
          section1.addComponents(textDisplay1, textDisplay2);
          section2.addComponents(textDisplay3, joinButton);
        }

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

        // コンテナ構築（複数のメソッドを試行）
        if (typeof container.addSectionComponents === 'function') {
          container.addSectionComponents([section1, section2]).addActionRowComponents([actionRow]);
        } else if (typeof container.setSectionComponents === 'function') {
          container.setSectionComponents([section1, section2]).setActionRowComponents([actionRow]);
        } else if (typeof container.addComponents === 'function') {
          container.addComponents(section1, section2, actionRow);
        }

        await interaction.reply({
          components: [container],
          flags: MessageFlags?.IsComponentsV2 || 0
        });

        console.log('Components v2 sent successfully');
        return;

      } catch (error) {
        console.error('Components v2 failed:', error.message);
        console.error('Full error:', error);
        // フォールバックに進む
      }
    }

    // フォールバック：従来のEmbed + Buttons
    console.log('Using fallback Embed + Buttons');
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
  },
};
