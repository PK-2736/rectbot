require("dotenv").config();
const TOKEN = process.env.DISCORD_BOT_TOKEN;

const { Client, GatewayIntentBits } = require("discord.js");
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// コマンドの読み込み
client.commands = new Map();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// コマンドの実行をハンドリング
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this command!', flags: require('discord.js').MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: 'There was an error while executing this command!', flags: require('discord.js').MessageFlags.Ephemeral });
        }
      } catch (e) {
        console.error('Failed to send error response:', e);
      }
    }
  } else if (interaction.isButton()) {
    // ボタンインタラクションの処理
    const command = interaction.client.commands.get('gamerecruit'); // 仮にgamerecruitコマンドのボタンとして処理
    if (command && command.handleButton) {
      try {
        await command.handleButton(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error while handling the button!', flags: require('discord.js').MessageFlags.Ephemeral });
        }
      }
    }
  }
});

client.login(TOKEN);