const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

// Components v2の実験的インポート
let ComponentsV2Available = false;
let ContainerBuilder, SectionBuilder, TextDisplayBuilder, MessageFlags;

try {
  // discord.js v14の実験的Components v2を試行
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
        // Components v2実装（実験的）
        const textDisplay1 = new TextDisplayBuilder()
          .setContent('🎮 ゲーム募集');

        const textDisplay2 = new TextDisplayBuilder()
          .setContent('参加ボタンを押して募集に参加してください。');

        const textDisplay3 = new TextDisplayBuilder()
          .setContent('**参加者 (0人)**\n参加者なし');

        const joinButton = new ButtonBuilder()
          .setCustomId('join')
          .setLabel('参加')
          .setStyle(ButtonStyle.Success);

        const section1 = new SectionBuilder()
          .addComponents(textDisplay1, textDisplay2);

        const section2 = new SectionBuilder()
          .addComponents(textDisplay3, joinButton);

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

        const container = new ContainerBuilder()
          .addComponents(section1, section2, actionRow);

        await interaction.reply({
          components: [container],
          flags: MessageFlags?.IsComponentsV2 || 0
        });

        console.log('Components v2 sent successfully');
        return;

      } catch (error) {
        console.error('Components v2 failed:', error.message);
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
