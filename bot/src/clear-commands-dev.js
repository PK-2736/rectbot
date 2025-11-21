require('dotenv').config({ path: require('path').join(__dirname, '../.env.dev') });
const { REST, Routes } = require('discord.js');

// 開発用Botのトークンとクライアントを使用
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN_DEV;
const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID_DEV;
const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID_DEV;

if (!token) {
  console.error('❌ DISCORD_BOT_TOKEN or DISCORD_BOT_TOKEN_DEV is not set');
  process.exit(1);
}

if (!clientId) {
  console.error('❌ CLIENT_ID or DISCORD_CLIENT_ID_DEV is not set');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🗑️  Starting to delete all application commands...');
    console.log(`Bot Token: ${token.slice(0, 20)}...`);
    console.log(`Client ID: ${clientId}`);
    console.log(`Guild ID: ${guildId || 'Not specified (will clear global commands)'}`);

    // ギルドコマンドをクリア
    if (guildId) {
      console.log(`\n🔄 Clearing guild commands for guild ${guildId}...`);
      const guildCommands = await rest.get(
        Routes.applicationGuildCommands(clientId, guildId)
      );
      console.log(`Found ${guildCommands.length} guild commands`);
      
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );
      console.log('✅ Successfully cleared all guild commands');
    }

    // グローバルコマンドもクリア
    console.log('\n🔄 Clearing global commands...');
    const globalCommands = await rest.get(
      Routes.applicationCommands(clientId)
    );
    console.log(`Found ${globalCommands.length} global commands`);
    
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );
    console.log('✅ Successfully cleared all global commands');

    console.log('\n✨ All commands have been deleted successfully!');
    console.log('💡 You can now re-deploy commands using deploy-commands-guild.js or deploy-commands.js');
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.code === 50001) {
      console.error('⚠️  Missing Access - Check if the bot has the applications.commands scope');
    }
  }
  process.exit(0);
})();
