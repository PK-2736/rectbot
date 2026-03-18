const { MessageFlags } = require('discord.js');

function isUnknownInteractionError(err) {
  return !!(err && err.code === 10062);
}

function isComponentsV2FlagRemovalError(err) {
  const msg = String(err?.message || '');
  return msg.includes('MESSAGE_CANNOT_REMOVE_COMPONENTS_V2_FLAG') || msg.includes('flags[MESSAGE_CANNOT_REMOVE_COMPONENTS_V2_FLAG]');
}

function normalizeFlagsPayload(options) {
  if (!options || typeof options !== 'object') return options;

  const normalized = { ...options };
  const hasEphemeral = Object.prototype.hasOwnProperty.call(normalized, 'ephemeral');
  const hasFlags = typeof normalized.flags === 'number';
  const baseFlags = hasFlags ? normalized.flags : 0;

  if (hasEphemeral) {
    const eph = !!normalized.ephemeral;
    delete normalized.ephemeral;
    normalized.flags = eph
      ? (baseFlags | MessageFlags.Ephemeral)
      : baseFlags;
  }

  return normalized;
}

function ensureComponentsV2Flag(options) {
  const normalized = normalizeFlagsPayload(options);
  const flags = typeof normalized?.flags === 'number' ? normalized.flags : 0;
  return { ...(normalized || {}), flags: (flags | MessageFlags.IsComponentsV2) };
}

async function attemptInteractionCall(call) {
  try {
    return { ok: true, result: await call() };
  } catch (error) {
    return { ok: false, error };
  }
}

function shouldAttemptReply(interaction) {
  return !interaction.replied && !interaction.deferred;
}

function handleReplyError(error) {
  if (isUnknownInteractionError(error)) {
    console.warn('safeReply: Unknown interaction (ignored)');
    return null;
  }
  console.warn('safeReply unexpected error:', error?.message || error);
  return null;
}

async function tryReply(interaction, options) {
  if (!shouldAttemptReply(interaction)) {
    return null;
  }

  const payload = normalizeFlagsPayload(options);
  const replyResult = await attemptInteractionCall(() => interaction.reply(payload));
  if (replyResult.ok) {
    return replyResult.result;
  }
  
  return handleReplyError(replyResult.error);
}

async function tryFollowUp(interaction, options) {
  const payload = normalizeFlagsPayload(options);
  const followUpResult = await attemptInteractionCall(() => interaction.followUp(payload));
  if (followUpResult.ok) return followUpResult.result;
  return followUpResult;
}

async function tryEdit(interaction, options) {
  const payload = normalizeFlagsPayload(options);
  const editResult = await attemptInteractionCall(() => interaction.editReply(payload));
  if (editResult.ok) return editResult.result;

  if (isComponentsV2FlagRemovalError(editResult.error)) {
    const v2Payload = ensureComponentsV2Flag(payload);
    const retryResult = await attemptInteractionCall(() => interaction.editReply(v2Payload));
    if (retryResult.ok) return retryResult.result;
  }

  console.warn('safeReply: all response methods failed:', editResult.error?.message || editResult.error);
  return null;
}

async function safeReply(interaction, options) {
  if (!interaction) return null;

  const replyResult = await tryReply(interaction, options);
  if (replyResult) return replyResult;

  const followUpResult = await tryFollowUp(interaction, options);
  if (followUpResult.ok) return followUpResult.result;

  return await tryEdit(interaction, options);
}

async function safeUpdate(interaction, options) {
  if (!interaction) return null;
  
  if (typeof interaction.update === 'function') {
    try {
      return await interaction.update(options);
    } catch (err) {
      if (isUnknownInteractionError(err)) {
        console.warn('safeUpdate: Unknown interaction (ignored)');
        return null;
      }
      console.warn('safeUpdate unexpected error:', err?.message || err);
    }
  }
  
  // Fallback to safeReply
  try {
    return await safeReply(interaction, options);
  } catch (_e) {
    return null;
  }
}

module.exports = { safeReply, safeUpdate };
