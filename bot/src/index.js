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
  ]
});

// 同一インタラクションの重複処理を防ぐための簡易デデュープ
const processedInteractions = new Set();
const DEDUPE_TTL_MS = 60_000; // 60秒後に削除

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

client.once('clientReady', () => {
  console.log(`[ready] Logged in as ${client.user.tag} (id: ${client.user.id})`);
});

// コマンドの実行をハンドリング
client.on('interactionCreate', async interaction => {
  try {
    console.log(`[interaction] received: type=${interaction.type}${interaction.isChatInputCommand() ? ` command=${interaction.commandName}` : ''}${interaction.isButton() ? ` button=${interaction.customId}` : ''}`);
  } catch (_) {}

  // デデュープ: すでに処理済みのインタラクションIDなら無視
  if (processedInteractions.has(interaction.id)) {
    return;
  }
  processedInteractions.add(interaction.id);
  setTimeout(() => processedInteractions.delete(interaction.id), DEDUPE_TTL_MS);
  // 二重応答(40060)を避けるための安全な返信関数
  const safeRespond = async (payload) => {
    try {
      if (interaction.deferred || interaction.replied) {
        return await interaction.followUp(payload);
      }
      return await interaction.reply(payload);
    } catch (e) {
      // 既に応答済み (40060) か、初回 reply が失敗した場合は followUp を試す
      if (e && (e.code === 40060 || e.status === 400)) {
        try {
          return await interaction.followUp(payload);
        } catch (_) {
          // それでも失敗したら黙って無視（ログは上位で出す）
        }
      }
      throw e;
    }
  };
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
      await safeRespond({ content: 'There was an error while executing this command!', flags: require('discord.js').MessageFlags.Ephemeral }).catch((e)=>{
        console.error('Failed to send error response:', e);
      });
    }
  } else if (interaction.isModalSubmit && interaction.isModalSubmit()) {
    // モーダル送信(type=5)の処理
    const command = interaction.client.commands.get('gamerecruit');
    if (command && command.handleModalSubmit) {
      try {
        await command.handleModalSubmit(interaction);
      } catch (error) {
        console.error(error);
        await safeRespond({ content: 'There was an error while handling the modal!', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
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
        await safeRespond({ content: 'There was an error while handling the button!', flags: require('discord.js').MessageFlags.Ephemeral }).catch(()=>{});
      }
    }
  }
});

client.login(TOKEN);