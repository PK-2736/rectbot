require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  // testwelcome.jsはグローバルコマンドに登録しない
  if (file === 'testwelcome.js') continue;
  const command = require(`./commands/${file}`);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('CLIENT_ID is not set in environment variables');
  process.exit(1);
}

// グローバルコマンドの場合、GUILD_IDは不要
// if (!process.env.GUILD_ID) {
//   console.error('GUILD_ID is not set in environment variables');
//   process.exit(1);
// }

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} global application commands.`);
    
    // グローバルコマンドとしてデプロイ
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    
    console.log(`Successfully reloaded ${data.length} global application commands.`);
    console.log('Note: Global commands may take up to 1 hour to propagate to all servers.');
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
})();
