const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testwelcome')
    .setDescription('ウェルカムメッセージのテスト（開発者用）'),
  
  async execute(interaction) {
    // 開発者のみ実行可能（必要に応じてユーザーIDを変更）
    const allowedUsers = ['YOUR_USER_ID_HERE']; // 実際のユーザーIDに変更してください
    
    if (!allowedUsers.includes(interaction.user.id)) {
      await interaction.reply({ 
        content: '❌ このコマンドは開発者のみ使用できます。', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      // guildCreateイベントハンドラーを手動実行
      const guildCreateHandler = require('../events/guildCreate.js');
      await guildCreateHandler.execute(interaction.guild);
      
      await interaction.editReply('✅ ウェルカムメッセージのテストを実行しました。');
      
    } catch (error) {
      console.error('ウェルカムメッセージテスト中にエラー:', error);
      await interaction.editReply('❌ テスト実行中にエラーが発生しました。');
    }
  },
};