const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { validateFriendCodeWithWorker, addFriendCodeToWorker } = require('../utils/workerApiClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id_add')
    .setDescription('フレンドコードを登録します'),

  noDefer: true, // モーダル表示のためdeferReplyを行わない

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('friend_code_add_modal')
      .setTitle('フレンドコード登録');

    const gameNameInput = new TextInputBuilder()
      .setCustomId('game_name')
      .setLabel('ゲーム名')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: Valorant, Apex, マイクラ, valo, えぺ')
      .setRequired(true)
      .setMaxLength(50);

    const friendCodeInput = new TextInputBuilder()
      .setCustomId('friend_code')
      .setLabel('フレンドコード / ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: Player#1234, SW-0000-0000-0000')
      .setRequired(true)
      .setMaxLength(100);

    modal.addComponents(
      new ActionRowBuilder().addComponents(gameNameInput),
      new ActionRowBuilder().addComponents(friendCodeInput)
    );

    await interaction.showModal(modal);
  },

  async handleModalSubmit(interaction) {
    await interaction.deferReply({ flags: 64 }); // 64 = Ephemeral

    try {
      const gameNameInput = interaction.fields.getTextInputValue('game_name');
      const gameName = String(gameNameInput || '').trim();
      const friendCode = interaction.fields.getTextInputValue('friend_code');
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      if (!gameName) {
        return interaction.editReply({
          content: '❌ ゲーム名を入力してください。'
        });
      }

      // フレンドコード/IDを検証
      await interaction.editReply({ content: '🔍 AIがフレンドコード/IDを検証中...' });

      const validation = await validateFriendCodeWithWorker(gameName, friendCode);

      if (!validation.isValid) {
        let errorMessage = `❌ **${gameName}** のフレンドコード/IDの形式が正しくない可能性があります。\n\n`;
        errorMessage += `**入力値:** \`${friendCode}\`\n`;
        errorMessage += `**理由:** ${validation.message}\n`;
        
        if (validation.suggestions && validation.suggestions.length > 0) {
          errorMessage += `\n**ヒント:**\n${validation.suggestions.map(s => `• ${s}`).join('\n')}`;
        }
        
        errorMessage += `\n\n信頼度: ${(validation.confidence * 100).toFixed(0)}%`;
        errorMessage += `\n\n本当に登録する場合は、もう一度コマンドを実行してください。`;

        return interaction.editReply({ content: errorMessage });
      }

      // Worker API 経由で D1 に保存
      await addFriendCodeToWorker(userId, guildId, gameName, friendCode, gameName);

      // 結果メッセージ
      const message = `✅ **${gameName}** のフレンドコードを登録しました！\n\`\`\`${friendCode}\`\`\``;

      await interaction.editReply({ content: message });

    } catch (error) {
      console.error('[link-add] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの登録中にエラーが発生しました。\nWorker APIに接続できない可能性があります。'
      });
    }
  }
};
