const { SlashCommandBuilder } = require('discord.js');
const { getFriendCodesFromWorker, deleteFriendCodeFromWorker, normalizeGameNameWithWorker } = require('../utils/workerApiClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id_delete')
    .setDescription('登録したフレンドコードを削除します')
    .addStringOption(option =>
      option.setName('game')
        .setDescription('削除するゲーム名')
        .setRequired(true)
        .setAutocomplete(true)),

  async autocomplete(interaction) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const allCodes = await fetchUserFriendCodes(interaction.user.id, interaction.guild.id);
      const options = buildAutocompleteOptions(allCodes, focusedValue);
      await interaction.respond(options);
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
      const message = gameNameInput === '__DELETE_ALL__'
        ? await handleDeleteAll(userId, guildId)
        : await handleDeleteSingle(gameNameInput, userId, guildId);
      await interaction.editReply({ content: message });
    } catch (error) {
      console.error('[link-delete] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの削除中にエラーが発生しました。'
      });
    }
  }
};

async function fetchUserFriendCodes(userId, guildId) {
  const allCodes = await getFriendCodesFromWorker(userId, guildId);
  return Array.isArray(allCodes) ? allCodes : [];
}

function buildAutocompleteOptions(allCodes, focusedValue) {
  const gameNames = [...new Set(allCodes.map(code => code.original_game_name || code.game_name))];
  const filtered = gameNames.filter(name => name.toLowerCase().includes(focusedValue));
  const options = [{ name: '🗑️ すべて削除', value: '__DELETE_ALL__' }];
  options.push(...filtered.slice(0, 24).map(name => ({ name, value: name })));
  return options;
}

async function handleDeleteAll(userId, guildId) {
  const allCodes = await fetchUserFriendCodes(userId, guildId);
  if (allCodes.length === 0) {
    return '❌ 登録されているフレンドコードがありません。';
  }

  const count = allCodes.length;
  const gameList = [...new Set(allCodes.map(code => code.original_game_name || code.game_name))].join(', ');

  let deletedCount = 0;
  for (const code of allCodes) {
    const success = await deleteFriendCodeFromWorker(userId, guildId, code.game_name);
    if (success) deletedCount++;
  }

  return `✅ すべてのフレンドコードを削除しました。\n\n削除したゲーム (${deletedCount}/${count}):\n${gameList}`;
}

async function handleDeleteSingle(gameNameInput, userId, guildId) {
  const result = await normalizeGameNameWithWorker(gameNameInput, userId, guildId);
  const normalized = result.normalized;

  if (!normalized) {
    return '❌ ゲーム名を認識できませんでした。';
  }

  const success = await deleteFriendCodeFromWorker(userId, guildId, normalized);
  if (!success) {
    return `❌ **${normalized}** のフレンドコードは登録されていません。`;
  }

  return `✅ **${normalized}** のフレンドコードを削除しました。`;
}
