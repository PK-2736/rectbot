require('dotenv').config({ path: require('path').join(__dirname, '../.env.dev') });
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

if (!targetGuildId) {
  console.error('Target guild is not set. Use: `node src/deploy-commands-guild.js <GUILD_ID>` or set TARGET_GUILD_ID/GUILD_ID');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    const commands = [];
    const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      // testwelcome.js はギルド向けデプロイにも含めない（必要なら除外を外してください）
      if (file === 'testwelcome.js') continue;
      const command = require(`./commands/${file}`);
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
      }
    }

    console.log(`Started refreshing ${commands.length} guild application commands for guild ${targetGuildId}.`);

    // ギルド固有のコマンドとしてデプロイ（即時反映）
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, targetGuildId),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} guild application commands for guild ${targetGuildId}.`);
    console.log('Note: Guild commands take effect almost immediately. Use this during development.');
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
})();
