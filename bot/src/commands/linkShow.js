const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getFriendCodesFromWorker } = require('../utils/workerApiClient');

const GAME_META_PREFIX = '__GAME_META__:';

function parseStoredGameMeta(code) {
  let gameName = String(code?.game_name || '').trim();
  const rawOriginal = String(code?.original_game_name || '').trim();

  // game_nameにメタデータプレフィックスが含まれている場合は除去（データ整合性のため）
  if (gameName.startsWith(GAME_META_PREFIX)) {
    try {
      const parsed = JSON.parse(gameName.slice(GAME_META_PREFIX.length));
      gameName = String(parsed?.name || '').trim() || gameName;
    } catch (_e) {
      // パース失敗時はそのまま使用
    }
  } else if (gameName.includes('GAME_META:')) {
    // プレフィックスなしでメタデータが含まれている場合も処理
    try {
      const metaStart = gameName.indexOf('GAME_META:');
      const parsed = JSON.parse(gameName.slice(metaStart + 10));
      gameName = String(parsed?.name || '').trim() || gameName;
    } catch (_e) {
      // パース失敗時はそのまま使用
    }
  }

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id_show')
    .setDescription('登録されているフレンドコードを表示します')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('表示するユーザー（省略時は自分）')
        .setRequired(false)),

  deferOptions: { ephemeral: false }, // 公開で表示

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;
    const guildId = interaction.guild.id;

    try {
      const friendCodes = await getFriendCodesFromWorker(userId, guildId);

      if (!friendCodes || friendCodes.length === 0) {
        return interaction.editReply({
          content: targetUser.id === interaction.user.id
            ? '❌ 登録されているフレンドコードがありません。\n`/id_add` で登録してください。'
            : `❌ ${targetUser.username} さんは登録されているフレンドコードがありません。`
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎮 ${targetUser.username} のフレンドコード`)
        .setColor('#00ff00')
        .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
        .setTimestamp();

      for (const fc of friendCodes) {
        const { displayName, triggerWords } = parseStoredGameMeta(fc);
        const label = triggerWords.length > 0
          ? `${displayName} (反応: ${triggerWords.join(', ')})`
          : displayName;

        embed.addFields({
          name: `📌 ${label}`.slice(0, 256),
          value: `\`\`\`${fc.friend_code}\`\`\``,
          inline: false
        });
      }

      embed.setFooter({ text: `登録数: ${friendCodes.length} | データソース: Cloudflare D1` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[link-show] Error:', error);
      return interaction.editReply({
        content: '❌ フレンドコード取得中にエラーが発生しました。'
      });
    }
  }
};
