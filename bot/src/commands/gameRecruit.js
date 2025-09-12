const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamerecruit')
    .setDescription('ゲーム募集を作成します'),
  async execute(interaction) {
    // モーダル表示・募集画像生成などは後で実装
    await interaction.reply('ゲーム募集機能（仮）');
  },
};
