const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const config = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();

// コマンドのロード
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// イベントのロード
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// デバッグ：環境変数の確認
console.log('DISCORD_BOT_TOKEN length:', config.DISCORD_BOT_TOKEN ? config.DISCORD_BOT_TOKEN.length : 'undefined');
console.log('Token first 10 chars:', config.DISCORD_BOT_TOKEN ? config.DISCORD_BOT_TOKEN.substring(0, 10) : 'undefined');

client.login(config.DISCORD_BOT_TOKEN);
