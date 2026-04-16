const backendFetch = require('./common/backendFetch');

const TARGET_GUILD_ID = process.env.SUBSCRIPTION_ROLE_SYNC_GUILD_ID || '1414530004657766422';
const TARGET_ROLE_ID = process.env.SUBSCRIPTION_ROLE_SYNC_ROLE_ID || '1494253859500068915';
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SYNC_INTERVAL_MS = toPositiveInt(process.env.SUBSCRIPTION_ROLE_SYNC_INTERVAL_MS, DEFAULT_INTERVAL_MS);

async function isPremiumUser(userId) {
  try {
    const params = new URLSearchParams({ userId: String(userId || '') });
    const status = await backendFetch(`/api/stripe/bot/subscription-status?${params.toString()}`, {
      method: 'GET',
    });

    return !!status?.isPremium;
  } catch (error) {
    console.warn('[subscription-role-sync] failed to fetch subscription status:', userId, error?.message || error);
    return false;
  }
}

async function runSubscriptionRoleSync(client) {
  if (!client?.isReady?.()) return;

  const guildId = String(TARGET_GUILD_ID || '').trim();
  const roleId = String(TARGET_ROLE_ID || '').trim();
  if (!guildId || !roleId) {
    console.warn('[subscription-role-sync] skipped: guildId or roleId is missing');
    return;
  }

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.warn('[subscription-role-sync] target guild not found:', guildId);
    return;
  }

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    console.warn('[subscription-role-sync] target role not found:', roleId);
    return;
  }

  const members = await guild.members.fetch().catch((error) => {
    console.warn('[subscription-role-sync] failed to fetch guild members:', error?.message || error);
    return null;
  });
  if (!members) return;

  let checked = 0;
  let assigned = 0;

  for (const member of members.values()) {
    if (!member || member.user?.bot) continue;
    checked += 1;

    if (member.roles.cache.has(roleId)) continue;

    const premium = await isPremiumUser(member.id);
    if (!premium) continue;

    try {
      await member.roles.add(roleId, 'Active premium subscription user detected by periodic sync');
      assigned += 1;
    } catch (error) {
      console.warn('[subscription-role-sync] failed to add role:', member.id, error?.message || error);
    }
  }

  console.log(`[subscription-role-sync] done. guild=${guildId} checked=${checked} assigned=${assigned}`);
}

function startSubscriptionRoleSync(client) {
  if (!client) return;

  let running = false;
  const runSafely = async () => {
    if (running) return;
    running = true;
    try {
      await runSubscriptionRoleSync(client);
    } catch (error) {
      console.warn('[subscription-role-sync] run failed:', error?.message || error);
    } finally {
      running = false;
    }
  };

  // Run once at startup, then periodically.
  void runSafely();
  setInterval(() => {
    void runSafely();
  }, SYNC_INTERVAL_MS);

  console.log(`[subscription-role-sync] started. guild=${TARGET_GUILD_ID} role=${TARGET_ROLE_ID} intervalMs=${SYNC_INTERVAL_MS}`);
}

module.exports = {
  startSubscriptionRoleSync,
};
