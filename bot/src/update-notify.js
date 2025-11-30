// Recrubo アップデート通知一斉送信スクリプト
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('./utils/db');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN is not set');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 通知内容をここで編集
const NOTIFY_TITLE = 'Recrubo アップデートのお知らせ';
const NOTIFY_DESC = '新機能や修正内容など、最新のアップデート情報をお届けします。';
const NOTIFY_COLOR = 0xF97316;

async function sendUpdateToAllGuilds() {
  let sent = 0, failed = 0;
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const settings = await getGuildSettings(guildId);
      const channelId = settings.update_channel || settings.recruit_channel;
      if (!channelId) continue;
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) continue;
      const embed = new EmbedBuilder()
        .setTitle(NOTIFY_TITLE)
        .setDescription(NOTIFY_DESC)
        .setColor(NOTIFY_COLOR)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
      sent++;
    } catch (e) {
      console.error(`[update-notify] ${guildId} 送信失敗:`, e);
      failed++;
    }
  }
  console.log(`[update-notify] 完了: ${sent}件送信, ${failed}件失敗`);
  process.exit(0);
}

client.once('ready', () => {
  console.log(`[update-notify] Bot ready: ${client.user.tag}`);
  sendUpdateToAllGuilds();
});

client.login(TOKEN);
