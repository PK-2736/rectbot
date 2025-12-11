const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { normalizeGameName } = require('../utils/gameNameNormalizer');
const { saveFriendCode } = require('../utils/db/friendCode');
const { handleComponentSafely } = require('../utils/componentHelpers');
const { safeRespond } = require('../utils/interactionHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link-add')
    .setDescription('フレンドコードを登録します'),

  async execute(interaction) {
    return handleComponentSafely(interaction, async () => {
      const modal = new ModalBuilder()
        .setCustomId('friend_code_add_modal')
        .setTitle('フレンドコード登録');

      const gameNameInput = new TextInputBuilder()
        .setCustomId('game_name')
        .setLabel('ゲーム名')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: Valorant, Apex, マイクラ')
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
    });
  },

  async handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const gameNameInput = interaction.fields.getTextInputValue('game_name');
      const friendCode = interaction.fields.getTextInputValue('friend_code');
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      // ゲーム名を正規化
      const { normalized, confidence } = normalizeGameName(gameNameInput);

      if (!normalized) {
        return interaction.editReply({
          content: '❌ ゲーム名を認識できませんでした。もう一度お試しください。'
        });
      }

      // フレンドコードを保存
      await saveFriendCode(userId, guildId, normalized, friendCode, gameNameInput);

      let message = `✅ **${normalized}** のフレンドコードを登録しました！\n\`\`\`${friendCode}\`\`\``;
      
      // 信頼度が低い場合は確認メッセージ
      if (confidence < 0.8) {
        message += `\n\n⚠️ 入力された「${gameNameInput}」を「${normalized}」として登録しました。`;
      }

      await interaction.editReply({ content: message });
    } catch (error) {
      console.error('[link-add] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの登録中にエラーが発生しました。'
      });
    }
  }
};
