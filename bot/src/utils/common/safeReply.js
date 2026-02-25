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

  const replyResult = await attemptInteractionCall(() => interaction.reply(options));
  if (replyResult.ok) {
    return replyResult.result;
  }
  
  return handleReplyError(replyResult.error);
}

async function tryFollowUp(interaction, options) {
  const followUpResult = await attemptInteractionCall(() => interaction.followUp(options));
  if (followUpResult.ok) return followUpResult.result;
  return followUpResult;
}

async function tryEdit(interaction, options) {
  const editResult = await attemptInteractionCall(() => interaction.editReply(options));
  if (editResult.ok) return editResult.result;
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
