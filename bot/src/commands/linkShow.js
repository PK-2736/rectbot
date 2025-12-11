const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getFriendCodesFromWorker } = require('../utils/workerApiClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link-show')
    .setDescription('登録されているフレンドコードを表示します')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('表示するユーザー（省略時は自分）')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    try {

      const targetUser = interaction.options.getUser('user') || interaction.user;
      const userId = targetUser.id;
      const guildId = interaction.guild.id;

      try {
        const friendCodes = await getFriendCodesFromWorker(userId, guildId);

        if (!friendCodes || friendCodes.length === 0) {
          return interaction.editReply({
            content: targetUser.id === interaction.user.id
              ? '❌ 登録されているフレンドコードがありません。\n`/link-add` で登録してください。'
              : `❌ ${targetUser.username} さんは登録されているフレンドコードがありません。`
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🎮 ${targetUser.username} のフレンドコード`)
          .setColor('#00ff00')
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .setTimestamp();

        for (const fc of friendCodes) {
          embed.addFields({
            name: `📌 ${fc.game_name}`,
            value: `\`\`\`${fc.friend_code}\`\`\``,
            inline: false
          });
        }

        embed.setFooter({ text: `登録数: ${friendCodes.length} | データソース: Cloudflare D1` });

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('[link-show] Error:', error);
        await interaction.editReply({
          content: '❌ フレンドコードの取得中にエラーが発生しました。'
        });
      }
    });
  }
};
