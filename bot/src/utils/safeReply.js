function isUnknownInteractionError(err) {
  return !!(err && err.code === 10062);
}

async function attemptInteractionCall(call) {
  try {
    return { ok: true, result: await call() };
  } catch (error) {
    return { ok: false, error };
  }
}

async function safeReply(interaction, options) {
  if (!interaction) return null;

  if (!interaction.replied && !interaction.deferred) {
    const replyResult = await attemptInteractionCall(() => interaction.reply(options));
    if (replyResult.ok) return replyResult.result;
    if (isUnknownInteractionError(replyResult.error)) {
      console.warn('safeReply: Unknown interaction (ignored)');
      return null;
    }
    console.warn('safeReply unexpected error:', replyResult.error?.message || replyResult.error);
  }

  const followUpResult = await attemptInteractionCall(() => interaction.followUp(options));
  if (followUpResult.ok) return followUpResult.result;

  const editResult = await attemptInteractionCall(() => interaction.editReply(options));
  if (editResult.ok) return editResult.result;

  console.warn('safeReply: all response methods failed:', editResult.error?.message || editResult.error);
  return null;
}

async function safeUpdate(interaction, options) {
  if (!interaction) return null;
  try {
    if (typeof interaction.update === 'function') {
      return await interaction.update(options);
    }
    // fallback to reply-like behavior
    return await safeReply(interaction, options);
  } catch (err) {
    if (err && err.code === 10062) {
      console.warn('safeUpdate: Unknown interaction (ignored)');
      return null;
    }
    console.warn('safeUpdate unexpected error:', err?.message || err);
    try { return await safeReply(interaction, options); } catch (_e) { return null; }
  }
}

module.exports = { safeReply, safeUpdate };
