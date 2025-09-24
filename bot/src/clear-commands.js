require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('CLIENT_ID is not set in environment variables');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Clearing all global application commands...');
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: [] },
    );
    console.log(`Successfully cleared all global application commands.`);
  } catch (error) {
    console.error(error);
  }
})();
