
require("dotenv").config();
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const FAILOVER_ENABLED = String(process.env.FAILOVER_ENABLED || 'false').toLowerCase() === 'true';
const SITE_ID = process.env.SITE_ID || 'oci'; // 'oci' or 'xserver'

const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
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
  
  // ボットステータスを更新する関数
  const updateBotStatus = () => {
    const guildCount = client.guilds.cache.size;
    client.user.setActivity(`/help ${guildCount}servers`, {
      type: ActivityType.Custom
    });
    console.log(`[status] Updated bot status: /help ${guildCount}servers`);
  };
  
  // ギルド数をバックエンドに送信する関数（一時的にコメントアウト）
  /*
  const updateGuildCount = async () => {
    try {
      const guildCount = client.guilds.cache.size;
      console.log(`[guild-count] Current guild count: ${guildCount}`);
      
      if (!process.env.BACKEND_URL) {
        console.log('[guild-count] BACKEND_URL not set, skipping guild count update');
        return;
      }
      
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
  */
  
  // 初回実行
  updateBotStatus();
  console.log('[commands] runtime commands:', [...client.commands.keys()].join(', '));
  // updateGuildCount(); // 一時的にコメントアウト

  // --- 起動時ハイドレーション: Redis からアクティブな募集を読み込み、gameRecruit モジュールの recruitParticipants を初期化 ---
  try {
    const gameRecruit = require('./commands/gameRecruit');
    const db = require('./utils/db');
    (async () => {
      try {
        const recruits = await db.listRecruitsFromRedis();
        if (Array.isArray(recruits) && recruits.length > 0) {
          for (const r of recruits) {
            try {
              const msgId = r.message_id || r.messageId || null;
              if (msgId) {
                // 募集の参加者を Redis から取得して map にセット
                const participants = await db.getParticipantsFromRedis(msgId) || [];
                if (participants && participants.length > 0) {
                  // 内部 Map に直接アクセス（gameRecruit モジュール内の recruitParticipants を想定）
                  if (gameRecruit && gameRecruit.__hydrateParticipants) {
                    // モジュールが hydrate 関数を公開している場合はそれを使う
                    await gameRecruit.__hydrateParticipants(msgId, participants);
                  } else if (gameRecruit && gameRecruit.recruitParticipants) {
                    gameRecruit.recruitParticipants.set(msgId, participants);
                  } else {
                    // もし内部へのアクセスが異なる場合は console に出す
                    console.log('[hydration] gameRecruit モジュールに recruitParticipants マップが見つかりません');
                  }
                }
              }
            } catch (e) {
              console.warn('[hydration] 個別募集の復元で失敗:', e?.message || e);
            }
          }
          console.log('[hydration] Redis からアクティブ募集の復元が完了しました:', recruits.length);
        }
      } catch (e) {
        console.warn('[hydration] Redis からの募集一覧取得に失敗:', e?.message || e);
      }
    })();
  } catch (e) {
    console.warn('[hydration] gameRecruit モジュールの読み込みに失敗:', e?.message || e);
  }
  
  // 5分ごとにギルド数を更新（一時的にコメントアウト）
  /*
  setInterval(() => {
    updateBotStatus();
    updateGuildCount();
  }, 5 * 60 * 1000);
  */
  
  // ステータスのみ5分ごとに更新
  setInterval(() => {
    updateBotStatus();
  }, 5 * 60 * 1000);
});

// ギルド参加時と退出時にもギルド数を更新
client.on('guildCreate', async (guild) => {
  console.log(`[guild] Joined guild: ${guild.name} (${guild.id})`);
  
  // ステータスを更新
  const guildCount = client.guilds.cache.size;
  client.user.setActivity(`/help ${guildCount}servers`, {
    type: ActivityType.Custom
  });
  console.log(`[status] Updated bot status after guild join: /help ${guildCount}servers`);
  
  // バックエンド連携は一時的にコメントアウト
  /*
  if (!process.env.BACKEND_URL) {
    console.log('[guild-count] BACKEND_URL not set, skipping guild count update');
    return;
  }
  
  try {
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
  */
});

client.on('guildDelete', async (guild) => {
  console.log(`[guild] Left guild: ${guild.name} (${guild.id})`);
  
  // ステータスを更新
  const guildCount = client.guilds.cache.size;
  client.user.setActivity(`/help ${guildCount}servers`, {
    type: ActivityType.Custom
  });
  console.log(`[status] Updated bot status after guild leave: /help ${guildCount}servers`);
  
  // バックエンド連携は一時的にコメントアウト
  /*
  if (!process.env.BACKEND_URL) {
    console.log('[guild-count] BACKEND_URL not set, skipping guild count update');
    return;
  }
  
  try {
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
  */
});

async function startLogin() {
  try {
    await client.login(TOKEN);
  } catch (e) {
    console.error('[login] failed:', e?.message || e);
    throw e;
  }
}

async function stopClient() {
  try {
    if (client.isReady()) {
      await client.destroy();
    }
  } catch (e) {
    console.warn('[shutdown] client destroy error:', e?.message || e);
  }
}

if (!FAILOVER_ENABLED) {
  console.log('[failover] disabled; starting bot normally');
  startLogin();
} else {
  console.log(`[failover] enabled; site=${SITE_ID}`);
  const { runLeadership } = require('./utils/leaderElector');
  runLeadership({ siteId: SITE_ID, onAcquire: startLogin, onRelease: stopClient })
    .catch(err => {
      console.error('[failover] leadership loop crashed:', err?.message || err);
      process.exit(1);
    });
}