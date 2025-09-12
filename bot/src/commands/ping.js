const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Botの応答確認'),
  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
