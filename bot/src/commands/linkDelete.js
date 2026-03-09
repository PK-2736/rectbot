const { SlashCommandBuilder } = require('discord.js');
const { getFriendCodesFromWorker, deleteFriendCodeFromWorker } = require('../utils/workerApiClient');

const GAME_META_PREFIX = '__GAME_META__:';

function parseStoredGameMeta(code) {
  const gameName = String(code?.game_name || '').trim();
  const rawOriginal = String(code?.original_game_name || '').trim();

  if (!rawOriginal.startsWith(GAME_META_PREFIX)) {
    return { displayName: rawOriginal || gameName, triggerWords: [] };
  }

  try {
    const parsed = JSON.parse(rawOriginal.slice(GAME_META_PREFIX.length));
    const displayName = String(parsed?.name || gameName || '').trim() || gameName;
    const triggerWords = Array.isArray(parsed?.triggerWords)
      ? parsed.triggerWords.map(w => String(w || '').trim()).filter(Boolean)
      : [];
    return { displayName, triggerWords };
  } catch (_e) {
    return { displayName: gameName, triggerWords: [] };
  }
}

function resolveDeleteTarget(allCodes, gameNameInput) {
  const inputLower = String(gameNameInput || '').toLowerCase().trim();
  return (allCodes || []).find(code => {
    const { displayName, triggerWords } = parseStoredGameMeta(code);
    const candidates = [displayName, code.game_name, ...triggerWords]
      .map(v => String(v || '').toLowerCase().trim())
      .filter(Boolean);
    return candidates.includes(inputLower);
  });
}

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
      const userId = interaction.user.id;
      const guildId = interaction.guild.id;

      // ユーザーが登録している全てのフレンドコードを取得
      const allCodes = await getFriendCodesFromWorker(userId, guildId);

      // ゲーム名のリストを作成（重複を除去）
      const gameNames = [...new Set(allCodes.map(code => parseStoredGameMeta(code).displayName))];

      // 「すべて削除」オプションを追加
      const options = [{ name: '🗑️ すべて削除', value: '__DELETE_ALL__' }];

      // 入力値でフィルタリング
      const filtered = gameNames.filter(name => 
        name.toLowerCase().includes(focusedValue)
      );

      // ゲーム名を追加
      options.push(...filtered.slice(0, 24).map(name => ({
        name: name,
        value: name
      })));

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
      // 「すべて削除」が選択された場合
      if (gameNameInput === '__DELETE_ALL__') {
        // 確認のために登録数を取得
        const allCodes = await getFriendCodesFromWorker(userId, guildId);
        
        if (!allCodes || allCodes.length === 0) {
          return interaction.editReply({
            content: '❌ 登録されているフレンドコードがありません。'
          });
        }

        const count = allCodes.length;
        const gameList = [...new Set(allCodes.map(code => parseStoredGameMeta(code).displayName))].join(', ');

        // すべて削除を実行
        let deletedCount = 0;
        for (const code of allCodes) {
          const success = await deleteFriendCodeFromWorker(userId, guildId, code.game_name);
          if (success) deletedCount++;
        }

        return interaction.editReply({
          content: `✅ すべてのフレンドコードを削除しました。\n\n削除したゲーム (${deletedCount}/${count}):\n${gameList}`
        });
      }

      // 個別のゲームを削除（表示名・反応ワード・保存名のいずれでも指定可）
      const allCodes = await getFriendCodesFromWorker(userId, guildId);
      const target = resolveDeleteTarget(allCodes, gameNameInput);

      if (!target) {
        return interaction.editReply({
          content: `❌ **${gameNameInput}** のフレンドコードは登録されていません。`
        });
      }

      const success = await deleteFriendCodeFromWorker(userId, guildId, target.game_name);

      if (!success) {
        return interaction.editReply({
          content: `❌ **${gameNameInput}** のフレンドコードは登録されていません。`
        });
      }

      const displayName = parseStoredGameMeta(target).displayName;
      await interaction.editReply({
        content: `✅ **${displayName}** のフレンドコードを削除しました。`
      });
    } catch (error) {
      console.error('[link-delete] Error:', error);
      await interaction.editReply({
        content: '❌ フレンドコードの削除中にエラーが発生しました。'
      });
    }
  }
};
