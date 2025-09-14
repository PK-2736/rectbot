const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('friendcode')
    .setDescription('フレンドコードを保存・表示します'),
  async execute(interaction) {
    // フレンドコード保存・表示処理は後で実装
    await interaction.reply('フレンドコード保存機能（仮）');
  },
};
