const { ChatInputCommandBuilder } = require('discord.js');

module.exports = {
  data: new ChatInputCommandBuilder()
    .setName('ping')
    .setDescription('Botの応答確認'),
  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
