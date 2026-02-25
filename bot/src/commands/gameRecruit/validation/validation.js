const { MessageFlags } = require('discord.js');
const { pendingModalOptions } = require('../data/state');
const { safeReply } = require('../../../utils/safeReply');
const { createErrorEmbed } = require('../../../utils/embedHelpers');
const { getGuildSettings, listRecruitsFromRedis, getCooldownRemaining } = require('../utils/database');
const { EXEMPT_GUILD_IDS } = require('../data/constants');

const MIN_PARTICIPANTS = 1;
const MAX_PARTICIPANTS = 16;

function isGuildExempt(guildId) {
  return EXEMPT_GUILD_IDS.has(String(guildId));
}

async function enforceCooldown(interaction) {
  try {
    if (isGuildExempt(interaction.guildId)) return true;
    const remaining = await getCooldownRemaining(`rect:${interaction.guildId}`);
    if (remaining > 0) {
      const mm = Math.floor(remaining / 60);
      const ss = remaining % 60;
      await safeReply(interaction, { 
        content: `⏳ このサーバーの募集コマンドはクールダウン中です。あと ${mm}:${ss.toString().padStart(2, '0')} 待ってから再度お試しください。`, 
        flags: MessageFlags.Ephemeral, 
        allowedMentions: { roles: [], users: [] } 
      });
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[rect cooldown check] failed:', e?.message || e);
    return true;
  }
}

async function ensureNoActiveRecruit(interaction) {
  if (isGuildExempt(interaction.guildId)) return true;
  try {
    const allRecruits = await listRecruitsFromRedis();
    const guildIdStr = String(interaction.guildId);
    if (Array.isArray(allRecruits)) {
      const matched = allRecruits.filter(r => {
        const gid = String(r?.guildId ?? r?.guild_id ?? r?.guild ?? r?.metadata?.guildId ?? r?.metadata?.guild ?? '');
        const status = String(r?.status ?? '').toLowerCase();
        return gid === guildIdStr && (status === 'recruiting' || status === 'active');
      });
      if (matched.length >= 3) {
        await safeReply(interaction, { 
          embeds: [createErrorEmbed('このサーバーでは同時に実行できる募集は3件までです。\n既存の募集をいくつか締め切ってから新しい募集を作成してください。', '募集上限到達')], 
          flags: MessageFlags.Ephemeral, 
          allowedMentions: { roles: [], users: [] } 
        });
        return false;
      }
    }
    return true;
  } catch (e) {
    console.warn('listRecruitsFromRedis failed:', e?.message || e);
    return true;
  }
}

function parseParticipantsNumFromModal(interaction) {
  const pending = interaction.user?.id ? pendingModalOptions.get(interaction.user.id) : null;
  const participantsNum = pending?.participants;
  
  if (!participantsNum || isNaN(participantsNum) || participantsNum < MIN_PARTICIPANTS || participantsNum > MAX_PARTICIPANTS) {
    return null;
  }
  return participantsNum;
}

async function validateModalSubmission(interaction) {
  if (!(await enforceCooldown(interaction))) return null;
  if (!(await ensureNoActiveRecruit(interaction))) return null;
  
  const guildSettings = await getGuildSettings(interaction.guildId);
  const participantsNum = parseParticipantsNumFromModal(interaction);
  
  if (participantsNum === null) {
    await safeReply(interaction, { 
      embeds: [createErrorEmbed('参加人数は1〜16の数字で入力してください。', '入力エラー')], 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
    return null;
  }
  
  return guildSettings;
}

module.exports = {
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  isGuildExempt,
  enforceCooldown,
  ensureNoActiveRecruit,
  parseParticipantsNumFromModal,
  validateModalSubmission
};
