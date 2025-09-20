const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

// gameRecruitから募集データをインポート
const gameRecruit = require('./gameRecruit');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debugrecruit')
    .setDescription('募集のデバッグ情報を表示します（開発者用）'),

  async execute(interaction) {
    try {
      // 現在のメモリ上の募集データを取得
      const allRecruitData = gameRecruit.getAllRecruitData ? gameRecruit.getAllRecruitData() : {};
      
      // チャンネル内の最近のbotメッセージを確認
      const messages = await interaction.channel.messages.fetch({ limit: 50 });
      const botMessages = [];
      
      for (const [messageId, message] of messages) {
        if (message.author.id === interaction.client.user.id && 
            message.components && message.components.length > 0) {
          botMessages.push({
            messageId,
            recruitId: messageId.slice(-8),
            hasRecruitData: !!gameRecruit.getRecruitData(messageId),
            createdAt: message.createdAt.toISOString()
          });
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🔧 募集デバッグ情報')
        .setColor(0x00FF00)
        .addFields(
          {
            name: '📊 メモリ上の募集データ',
            value: Object.keys(allRecruitData).length > 0 
              ? Object.entries(allRecruitData).map(([msgId, data]) => 
                  `• ID: \`${data.recruitId}\` - ${data.title} (${data.recruiterId})`
                ).join('\n')
              : '募集データなし',
            inline: false
          },
          {
            name: '💬 チャンネル内のbotメッセージ',
            value: botMessages.length > 0
              ? botMessages.map(msg => 
                  `• ID: \`${msg.recruitId}\` - ${msg.hasRecruitData ? '✅' : '❌'} データあり`
                ).join('\n')
              : 'botメッセージなし',
            inline: false
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error('debugRecruit error:', error);
      await interaction.reply({
        content: 'デバッグ情報の取得中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};