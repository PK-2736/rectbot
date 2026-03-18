require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('CLIENT_ID is not set in environment variables');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) are required');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
const supabase = createClient(supabaseUrl, supabaseKey);

function loadPremiumCommands() {
  const premiumCommands = [];
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    if (file === 'testwelcome.js') continue;
    const command = require(`./commands/${file}`);
    if (!command?.premiumGuildOnly) continue;
    if ('data' in command && 'execute' in command) {
      premiumCommands.push(command.data.toJSON());
    }
  }
  return premiumCommands;
}

async function fetchPremiumGuildIds() {
  const premiumGuildIds = new Set();

  const { data: settingsRows, error: settingsErr } = await supabase
    .from('guild_settings')
    .select('guild_id, premium_enabled, premium_subscription_id, enable_dedicated_channel');
  if (settingsErr) throw settingsErr;

  for (const row of settingsRows || []) {
    const guildId = String(row.guild_id || '').trim();
    if (!guildId) continue;
    if (row.premium_enabled || row.enable_dedicated_channel || row.premium_subscription_id) {
      premiumGuildIds.add(guildId);
    }
  }

  const { data: subRows, error: subErr } = await supabase
    .from('subscriptions')
    .select('purchased_guild_id, status')
    .in('status', ['active', 'trialing']);
  if (subErr) throw subErr;

  for (const row of subRows || []) {
    const guildId = String(row.purchased_guild_id || '').trim();
    if (guildId) premiumGuildIds.add(guildId);
  }

  return premiumGuildIds;
}

async function fetchBotGuildIds() {
  try {
    const guilds = await rest.get(Routes.userGuilds());
    return (Array.isArray(guilds) ? guilds : []).map(g => String(g.id));
  } catch (e) {
    console.warn('[deploy-premium-commands] failed to fetch bot guilds, fallback to premium guild list only:', e?.message || e);
    return [];
  }
}

async function syncGuildPremiumCommands(guildId, premiumCommandNamesSet, premiumCommands, isPremiumGuild) {
  try {
    const current = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId));
    const currentList = Array.isArray(current) ? current : [];

    const base = currentList.filter(cmd => !premiumCommandNamesSet.has(String(cmd.name)));
    const next = isPremiumGuild ? [...base, ...premiumCommands] : base;

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: next }
    );

    return { guildId, ok: true, count: next.length, premium: isPremiumGuild };
  } catch (e) {
    return { guildId, ok: false, error: e?.message || String(e), premium: isPremiumGuild };
  }
}

(async () => {
  try {
    const premiumCommands = loadPremiumCommands();
    if (premiumCommands.length === 0) {
      console.log('[deploy-premium-commands] No premiumGuildOnly commands found. Nothing to sync.');
      process.exit(0);
    }

    const premiumGuildIds = await fetchPremiumGuildIds();
    const botGuildIds = await fetchBotGuildIds();
    const targetGuildIds = botGuildIds.length > 0
      ? botGuildIds
      : Array.from(premiumGuildIds);

    const premiumNamesSet = new Set(premiumCommands.map(c => String(c.name)));

    console.log(`[deploy-premium-commands] premiumCommands=${premiumCommands.map(c => c.name).join(', ')}`);
    console.log(`[deploy-premium-commands] premiumGuilds=${premiumGuildIds.size}, targetGuilds=${targetGuildIds.length}`);

    let ok = 0;
    let failed = 0;
    for (const guildId of targetGuildIds) {
      const result = await syncGuildPremiumCommands(
        guildId,
        premiumNamesSet,
        premiumCommands,
        premiumGuildIds.has(String(guildId))
      );

      if (result.ok) {
        ok += 1;
        console.log(`[deploy-premium-commands] synced guild=${result.guildId} premium=${result.premium} commands=${result.count}`);
      } else {
        failed += 1;
        console.warn(`[deploy-premium-commands] failed guild=${result.guildId} premium=${result.premium}: ${result.error}`);
      }
    }

    console.log(`[deploy-premium-commands] done. success=${ok}, failed=${failed}`);
  } catch (error) {
    console.error('[deploy-premium-commands] fatal error:', error);
    process.exit(1);
  }

  process.exit(0);
})();
