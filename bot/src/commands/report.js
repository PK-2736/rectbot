const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { safeReply } = require('../utils/safeReply');

const REPORT_CHANNEL_ID = '1414750896507719680';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Recruboでエラーが発生した場合、開発者に報告できます'),
  noDefer: true,  // モーダル表示時はdeferできないため

  async execute(interaction) {
    await interaction.showModal(buildReportModal(interaction.user.id));
  },

  // モーダル送信時の処理
  async handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith('report_modal_')) return;

    try {
      const title = interaction.fields.getTextInputValue('report_title');
      const content = interaction.fields.getTextInputValue('report_content');

      const reportChannel = await getReportChannel(interaction.client);
      if (!reportChannel) {
        await safeReply(interaction, {
          content: '❌ 報告を送信できませんでした。管理者に連絡してください。',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const reportEmbed = buildReportEmbed({ interaction, title, content });
      const buttonRow = buildReplyButtonRow(interaction.user.id);
      await reportChannel.send({ embeds: [reportEmbed], components: [buttonRow] });

      // ユーザーに確認メッセージを送信
      await safeReply(interaction, {
        embeds: [
          buildConfirmationEmbed()
        ],
        flags: MessageFlags.Ephemeral
      });

      console.log(`[report] エラー報告を受け取りました - ユーザー: ${interaction.user.tag}, タイトル: ${title}`);
    } catch (error) {
      console.error('[report] モーダル処理エラー:', error);
      await safeReply(interaction, {
        content: '❌ 報告の処理中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

function buildReportModal(userId) {
  const modal = new ModalBuilder()
    .setCustomId(`report_modal_${userId}`)
    .setTitle('Recrubo エラー報告');

  const titleInput = new TextInputBuilder()
    .setCustomId('report_title')
    .setLabel('エラーのタイトル')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(100)
    .setRequired(true);

  const contentInput = new TextInputBuilder()
    .setCustomId('report_content')
    .setLabel('報告内容（発生した状況・エラーメッセージなど）')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(4000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput)
  );

  return modal;
}

async function getReportChannel(client) {
  return client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
}

function buildReportEmbed({ interaction, title, content }) {
  return new EmbedBuilder()
    .setTitle(`📋 エラー報告: ${title}`)
    .setDescription(content)
    .setColor(0xFF6B6B)
    .setAuthor({
      name: interaction.user.tag,
      iconURL: interaction.user.displayAvatarURL({ dynamic: true })
    })
    .addFields(
      { name: 'ユーザーID', value: interaction.user.id, inline: true },
      { name: 'サーバーID', value: interaction.guildId || 'DM', inline: true },
      { name: 'タイムスタンプ', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: `報告ID: ${interaction.id}` })
    .setTimestamp();
}

function buildReplyButtonRow(userId) {
  const replyButton = new ButtonBuilder()
    .setCustomId(`report_reply_${userId}`)
    .setLabel('返信を送信')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(replyButton);
}

function buildConfirmationEmbed() {
  return new EmbedBuilder()
    .setTitle('✅ 報告が送信されました')
    .setDescription('報告ありがとうございます。このメッセージは開発者に送られます。\n\nまたbot経由でDMに返信することがあります。')
    .setColor(0x2F9E44);
}
