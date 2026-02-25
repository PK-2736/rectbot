const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getFriendCodesFromWorker } = require('../../utils/workerApiClient');

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
        const displayName = fc.original_game_name && fc.original_game_name !== fc.game_name
          ? `${fc.game_name} (登録名: ${fc.original_game_name})`
          : fc.game_name;
        
        embed.addFields({
          name: `📌 ${displayName}`,
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
