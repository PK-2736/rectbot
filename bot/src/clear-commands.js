require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');

// 優先順: CLI引数 > TARGET_GUILD_ID > GUILD_ID
const guildIdFromArg = process.argv[2];
const targetGuildId = guildIdFromArg || process.env.TARGET_GUILD_ID || process.env.GUILD_ID;

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
    if (targetGuildId) {
      console.log(`Clearing all GUILD(${targetGuildId}) application commands...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, targetGuildId),
        { body: [] },
      );
      console.log(`Successfully cleared all guild application commands for ${targetGuildId}.`);
    } else {
      console.log('Clearing all GLOBAL application commands...');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] },
      );
      console.log(`Successfully cleared all global application commands.`);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
