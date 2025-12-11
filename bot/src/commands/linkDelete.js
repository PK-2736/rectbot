const { SlashCommandBuilder } = require('discord.js');
const { searchGameNamesFromWorker, deleteFriendCodeFromWorker, normalizeGameNameWithWorker } = require('../utils/workerApiClient');

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

      // Worker API でゲーム名を検索
      const games = await searchGameNamesFromWorker(focusedValue);

      await interaction.respond(
        games.slice(0, 25).map(name => ({
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
    const gameNameInput = interaction.options.getString('game');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {

      // Worker AI でゲーム名を正規化
      const result = await normalizeGameNameWithWorker(gameNameInput, userId, guildId);
      const normalized = result.normalized;

      if (!normalized) {
        return interaction.editReply({
          content: '❌ ゲーム名を認識できませんでした。'
        });
      }

      // Worker API 経由で削除
      const success = await deleteFriendCodeFromWorker(userId, guildId, normalized);

      if (!success) {
        return interaction.editReply({
          content: `❌ **${normalized}** のフレンドコードは登録されていません。`
        });
      }

      await interaction.editReply({
        content: `✅ **${normalized}** のフレンドコードを削除しました。`
      });
    } catch (error) {
      console.error('[link-delete] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの削除中にエラーが発生しました。'
      });
    }
  }
};
