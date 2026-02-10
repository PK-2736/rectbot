/**
 * Utility functions extracted from handlers.js to reduce code duplication
 * and improve maintainability.
 */

/**
 * Sends a notification message asynchronously without blocking
 * @param {Object} channel - Discord channel to send to
 * @param {string} notificationRole - Role type: 'everyone', 'here', role ID, or null
 * @param {string} messageText - Text to send
 * @param {string} logContext - Context for error logging
 */
async function sendNotificationAsync(channel, notificationRole, messageText, logContext = '') {
  if (!channel || !notificationRole) return;
  
  try {
    let content = messageText;
    let allowedMentions = { roles: [], users: [] };

    if (notificationRole === 'everyone') {
      content = `${messageText}@everyone`;
      allowedMentions = { parse: ['everyone'] };
    } else if (notificationRole === 'here') {
      content = `${messageText}@here`;
      allowedMentions = { parse: ['everyone'] };
    } else {
      // Specific role ID
      content = `${messageText}<@&${notificationRole}>`;
      allowedMentions = { roles: [notificationRole] };
    }

    await channel.send({ content, allowedMentions });
  } catch (e) {
    console.warn(`通知送信失敗 ${logContext}:`, e?.message || e);
  }
}

/**
 * Formats voice channel information into a display label
 * @param {string} vcType - Voice channel type ('あり', 'あり(聞き専)', 'なし', etc.)
 * @param {string} voicePlace - Voice channel location/name
 * @returns {string} Formatted voice label
 */
function formatVoiceLabel(vcType, voicePlace) {
  if (!vcType) return '';
  
  if (vcType === 'あり(聞き専)') {
    return voicePlace ? `🎧 ${voicePlace}` : '🎧 あり(聞き専)';
  } else if (vcType === 'あり') {
    return voicePlace ? `🔊 ${voicePlace}` : '🔊 あり';
  } else if (vcType === 'なし') {
    return '🔇 なし';
  }
  
  return vcType;
}

/**
 * Fetches a user's avatar URL with error handling
 * @param {Object} client - Discord client
 * @param {string} userId - User ID to fetch avatar for
 * @returns {Promise<string|null>} Avatar URL or null if fetch fails
 */
async function fetchUserAvatarUrl(client, userId) {
  if (!client || !userId) return null;
  
  try {
    const user = await client.users.fetch(userId);
    return user?.displayAvatarURL?.() || null;
  } catch (err) {
    console.warn(`Avatar fetch failed for user ${userId}:`, err?.message || err);
    return null;
  }
}

/**
 * Formats a list of participants into a display string
 * @param {Array} participants - Array of participant user IDs
 * @param {number} maxSlots - Maximum number of slots
 * @returns {string} Formatted participant list
 */
function formatParticipantList(participants, maxSlots) {
  if (!Array.isArray(participants) || participants.length === 0) {
    return '';
  }
  
  const participantMentions = participants
    .slice(0, maxSlots)
    .map(pid => `<@${pid}>`)
    .join(' • ');
  
  return participantMentions;
}

/**
 * Executes an async function in the background without blocking
 * Useful for fire-and-forget operations like notifications
 * @param {Function} asyncFn - Async function to execute
 * @param {string} errorContext - Context for error logging
 */
function runInBackground(asyncFn, errorContext = 'Background task') {
  (async () => {
    try {
      await asyncFn();
    } catch (e) {
      console.warn(`${errorContext} failed:`, e?.message || e);
    }
  })();
}

module.exports = {
  sendNotificationAsync,
  formatVoiceLabel,
  fetchUserAvatarUrl,
  formatParticipantList,
  runInBackground
};
