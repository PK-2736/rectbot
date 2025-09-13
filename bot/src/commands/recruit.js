import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const row = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('primary')
      .setLabel('Click me!')
      .setStyle(ButtonStyle.Primary),
  );

await interaction.reply({
  content: 'ボタンをクリックしてください！',
  components: [row],
});
