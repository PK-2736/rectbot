async function safeReply(interaction, options) {
  if (!interaction) return null;
  try {
    if (!interaction.replied && !interaction.deferred) {
      return await interaction.reply(options);
    }
    try {
      return await interaction.followUp(options);
    } catch (_followErr) {
      try {
        return await interaction.editReply(options);
      } catch (editErr) {
        console.warn('safeReply: all response methods failed:', editErr?.message || editErr);
        return null;
      }
    }
  } catch (err) {
    if (err && err.code === 10062) {
      console.warn('safeReply: Unknown interaction (ignored)');
      return null;
    }
    console.warn('safeReply unexpected error:', err?.message || err);
    try { return await interaction.followUp(options); } catch (_e) { try { return await interaction.editReply(options); } catch (_e2) { return null; } }
  }
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
