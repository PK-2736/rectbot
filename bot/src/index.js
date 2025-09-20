require("dotenv").config();
const TOKEN = process.env.DISCORD_BOT_TOKEN;

const { Client, GatewayIntentBits } = require("discord.js");
const fs = require('fs');
const path = require('path');

console.log(`[boot] Starting bot. Node: ${process.version}, env: ${process.env.NODE_ENV || 'development'}`);
console.log(`[boot] CWD: ${process.cwd()}`);
if (!TOKEN) {
  console.error('[config] DISCORD_BOT_TOKEN is not set. Create .env and set DISCORD_BOT_TOKEN=...');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  allowedMentions: {
    roles: true,
    users: true,
    everyone: false
  }
});

// 同一インタラクションの重複処理を防ぐための簡易デデュープ
client.processedInteractions = new Set();
client.DEDUPE_TTL_MS = 60_000; // 60秒後に削除

client.on('warn', (m) => console.warn('[discord.js][warn]', m));
client.on('error', (e) => console.error('[discord.js][error]', e));
process.on('unhandledRejection', (e) => console.error('[process][unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[process][uncaughtException]', e));

// コマンドの読み込み
client.commands = new Map();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}
console.log(`[commands] Loaded ${client.commands.size} command(s): ${[...client.commands.keys()].join(', ')}`);

// イベントの読み込み
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}
console.log(`[events] Loaded ${eventFiles.length} event(s): ${eventFiles.map(f => f.replace('.js', '')).join(', ')}`);

client.once('clientReady', () => {
  console.log(`[ready] Logged in as ${client.user.tag} (id: ${client.user.id})`);
});

client.login(TOKEN);