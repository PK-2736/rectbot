const { SlashCommandBuilder } = require('discord.js');
const { getFriendCodesFromWorker, deleteFriendCodeFromWorker, normalizeGameNameWithWorker } = require('../utils/workerApiClient');

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
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      // ユーザーが登録している全てのフレンドコードを取得
      const allCodes = await getFriendCodesFromWorker(userId, guildId);

      // ゲーム名のリストを作成（重複を除去）
      const gameNames = [...new Set(allCodes.map(code => {
        // 登録時の名前があればそれを優先、なければ正規化後の名前
        return code.original_game_name || code.game_name;
      }))];

      // 入力値でフィルタリング
      const filtered = gameNames.filter(name => 
        name.toLowerCase().includes(focusedValue)
      );

      await interaction.respond(
        filtered.slice(0, 25).map(name => ({
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
