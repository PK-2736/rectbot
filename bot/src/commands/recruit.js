const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  AttachmentBuilder,
  MessageFlags
} = require('discord.js');
const { createCanvas } = require('canvas');

// ロゴ画像を生成
function generateLogo() {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  
  // 背景
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, 256, 256);
  
  // 円形の背景
  ctx.fillStyle = '#5865f2';
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.fill();
  
  // テキスト
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('募集', 128, 128);
  
  return canvas.toBuffer('image/png');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setDescription('募集用のEmbedとボタンを送信します'),
  
  async execute(interaction) {
    // Components v2 の利用可能性をチェック
    const hasComponentsV2 = typeof ContainerBuilder !== 'undefined' && 
                           typeof SectionBuilder !== 'undefined' &&
                           typeof TextDisplayBuilder !== 'undefined';

    // 添付ファイルを準備
    const logoBuffer = generateLogo();
    const logoAttachment = new AttachmentBuilder(logoBuffer, { name: 'logo.png' });

    if (hasComponentsV2) {
      // Components v2 を使用してEmbedの中にボタンを埋め込み
      const container = new ContainerBuilder()
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents([
              new TextDisplayBuilder({
                content: '# 🎮 ゲーム募集'
              }),
              new TextDisplayBuilder({
                content: '**参加者募集中！**\n下のボタンで参加・取り消し・締めができます。'
              })
            ])
            .setThumbnailAccessory(
              new ThumbnailBuilder({
                media: { url: 'attachment://logo.png' }
              })
            )
        )
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents([
              new TextDisplayBuilder({
                content: '## 参加する'
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
        files: [logoAttachment],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      // フォールバック：従来のEmbed + Buttons
      const { EmbedBuilder } = require('discord.js');
      
      // 初期embedで参加者リスト欄を必ず表示
      const embed = new EmbedBuilder()
        .setTitle('🎮 ゲーム募集')
        .setDescription('**参加者募集中！**\n下のボタンで参加・取り消し・締めができます。')
        .addFields(
          {
            name: '参加者 (0人)',
            value: '参加者なし',
            inline: false
          }
        )
        .setThumbnail('attachment://logo.png')
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
        embeds: [embed.toJSON()],
        components: [row],
        files: [logoAttachment]
      });
    }
  },
};
