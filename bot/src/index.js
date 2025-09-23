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
    parse: ['roles', 'users'],
    users: [],
    roles: [],
    repliedUser: false
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
  
  // ギルド数をバックエンドに送信する関数
  const updateGuildCount = async () => {
    try {
      const guildCount = client.guilds.cache.size;
      console.log(`[guild-count] Current guild count: ${guildCount}`);
      
      const response = await fetch(`${process.env.BACKEND_URL}/api/guild-count-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          count: guildCount,
          timestamp: new Date().toISOString(),
          bot_id: client.user.id
        }),
      });
      
      if (response.ok) {
        console.log(`[guild-count] Successfully updated guild count: ${guildCount}`);
      } else {
        console.log(`[guild-count] Failed to update guild count: ${response.status}`);
      }
    } catch (error) {
      console.error('[guild-count] Error updating guild count:', error);
    }
  };
  
  // 初回実行
  updateGuildCount();
  
  // 5分ごとにギルド数を更新
  setInterval(updateGuildCount, 5 * 60 * 1000);
});

// ギルド参加時と退出時にもギルド数を更新
client.on('guildCreate', async (guild) => {
  console.log(`[guild] Joined guild: ${guild.name} (${guild.id})`);
  try {
    const guildCount = client.guilds.cache.size;
    const response = await fetch(`${process.env.BACKEND_URL}/api/guild-count-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        count: guildCount,
        timestamp: new Date().toISOString(),
        bot_id: client.user.id,
        event: 'guild_create'
      }),
    });
    
    if (response.ok) {
      console.log(`[guild-count] Updated count after guild join: ${guildCount}`);
    }
  } catch (error) {
    console.error('[guild-count] Error updating count after guild join:', error);
  }
});

client.on('guildDelete', async (guild) => {
  console.log(`[guild] Left guild: ${guild.name} (${guild.id})`);
  try {
    const guildCount = client.guilds.cache.size;
    const response = await fetch(`${process.env.BACKEND_URL}/api/guild-count-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        count: guildCount,
        timestamp: new Date().toISOString(),
        bot_id: client.user.id,
        event: 'guild_delete'
      }),
    });
    
    if (response.ok) {
      console.log(`[guild-count] Updated count after guild leave: ${guildCount}`);
    }
  } catch (error) {
    console.error('[guild-count] Error updating count after guild leave:', error);
  }
});

client.login(TOKEN);