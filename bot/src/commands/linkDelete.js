const { SlashCommandBuilder } = require('discord.js');
const { normalizeGameName, suggestGameNames } = require('../utils/gameNameNormalizer');
const { deleteFriendCode, getFriendCode, searchFriendCodeByPattern } = require('../utils/db/friendCode');
const { handleComponentSafely } = require('../utils/componentHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link-delete')
    .setDescription('登録したフレンドコードを削除します')
    .addStringOption(option =>
      option.setName('game')
        .setDescription('削除するゲーム名')
        .setRequired(true)
        .setAutocomplete(true)),

  async autocomplete(interaction) {
    try {
      const focusedValue = interaction.options.getFocused();
      const suggestions = suggestGameNames(focusedValue, 25);
      
      await interaction.respond(
        suggestions.map(name => ({
          name: name,
          value: name
        }))
      );
    } catch (error) {
      console.error('[link-delete] Autocomplete error:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    return handleComponentSafely(interaction, async () => {
      await interaction.deferReply({ ephemeral: true });

      const gameNameInput = interaction.options.getString('game');
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      try {
        // ゲーム名を正規化
        const { normalized } = normalizeGameName(gameNameInput);

        if (!normalized) {
          return interaction.editReply({
            content: '❌ ゲーム名を認識できませんでした。'
          });
        }

        // フレンドコードが存在するか確認
        const existingCode = await getFriendCode(userId, guildId, normalized);

        if (!existingCode) {
          // パターン検索で類似のものを探す
          const similar = await searchFriendCodeByPattern(userId, guildId, gameNameInput);
          
          if (similar.length > 0) {
            const suggestions = similar.map(s => `• ${s.gameName}`).join('\n');
            return interaction.editReply({
              content: `❌ **${normalized}** のフレンドコードは登録されていません。\n\n似たゲーム名:\n${suggestions}`
            });
          }

          return interaction.editReply({
            content: `❌ **${normalized}** のフレンドコードは登録されていません。`
          });
        }

        // 削除実行
        await deleteFriendCode(userId, guildId, normalized);

        await interaction.editReply({
          content: `✅ **${normalized}** のフレンドコードを削除しました。`
        });
      } catch (error) {
        console.error('[link-delete] Error:', error);
        await interaction.editReply({
          content: '❌ フレンドコードの削除中にエラーが発生しました。'
        });
      }
    });
  }
};
