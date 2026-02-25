const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { normalizeGameNameWithWorker, validateFriendCodeWithWorker, addFriendCodeToWorker } = require('../../utils/workerApiClient');

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
      const friendCode = interaction.fields.getTextInputValue('friend_code');
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      // Workers AI でゲーム名を正規化
      await interaction.editReply({ content: '🤖 AIがゲーム名を判定中...' });

      const result = await normalizeGameNameWithWorker(gameNameInput, userId, guildId);
      const normalized = result.normalized;
      const confidence = result.confidence;

      if (!normalized) {
        return interaction.editReply({
          content: '❌ ゲーム名を認識できませんでした。もう一度お試しください。'
        });
      }

      // フレンドコード/IDを検証
      await interaction.editReply({ content: '🔍 AIがフレンドコード/IDを検証中...' });

      const validation = await validateFriendCodeWithWorker(normalized, friendCode);

      if (!validation.isValid) {
        let errorMessage = `❌ **${normalized}** のフレンドコード/IDの形式が正しくない可能性があります。\n\n`;
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
      await addFriendCodeToWorker(userId, guildId, normalized, friendCode, gameNameInput);

      // 結果メッセージ
      let message = `✅ **${normalized}** のフレンドコードを登録しました！\n\`\`\`${friendCode}\`\`\``;

      if (result.method === 'ai') {
        message += `\n\n🤖 AI判定: 「${gameNameInput}」→「${normalized}」`;
        
        if (confidence < 0.9) {
          message += `\n信頼度: ${(confidence * 100).toFixed(0)}%`;
        }

        if (result.matches && result.matches.length > 1) {
          const alternatives = result.matches.slice(1, 3).map(m => m.gameName).join(', ');
          message += `\n\n類似ゲーム: ${alternatives}`;
        }
      } else if (result.method === 'cache') {
        message += `\n\n💾 キャッシュから取得`;
      }

      await interaction.editReply({ content: message });

    } catch (error) {
      console.error('[link-add] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの登録中にエラーが発生しました。\nWorker APIに接続できない可能性があります。'
      });
    }
  }
};
