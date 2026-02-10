/**
 * Validation functions extracted from handlers.js
 * Decomposes complex conditionals into named boolean functions
 * Improves readability and reduces cyclomatic complexity
 */

/**
 * Checks if participants number from modal is valid
 * @param {number} participantsNum - Number to validate
 * @returns {boolean} True if valid
 */
function isValidParticipantsNumber(participantsNum) {
  return participantsNum !== null && 
         !isNaN(participantsNum) && 
         participantsNum >= 1 && 
         participantsNum <= 16;
}

/**
 * Checks if start delay is valid for notification
 * @param {number} startDelay - Delay in milliseconds
 * @returns {boolean} True if valid
 */
function isValidStartDelay(startDelay) {
  if (!startDelay || startDelay < 0) return false;
  const maxDelay = 36 * 60 * 60 * 1000; // 36 hours
  return startDelay <= maxDelay;
}

/**
 * Checks if start time is immediate ("今から")
 * @param {string} startTime - Start time string
 * @returns {boolean} True if immediate
 */
function isImmediateStartTime(startTime) {
  return startTime === '今から';
}

/**
 * Checks if a hex color string is valid
 * @param {string} color - Color to validate
 * @returns {boolean} True if valid
 */
function isValidHexColor(color) {
  if (typeof color !== 'string') return false;
  let clean = color;
  if (clean.startsWith('#')) clean = clean.slice(1);
  return /^[0-9A-Fa-f]{6}$/.test(clean);
}

/**
 * Checks if recruitment data has notification role
 * @param {Object} data - Recruitment data
 * @returns {boolean} True if has notification role
 */
function hasNotificationRole(data) {
  return data && data.notificationRoleId && data.notificationRoleId.length > 0;
}

/**
 * Checks if recruitment has voice chat enabled
 * @param {Object} data - Recruitment data
 * @returns {boolean} True if voice enabled
 */
function hasVoiceChat(data) {
  return data && data.voice === true;
}

/**
 * Checks if recruitment has voice channel ID
 * @param {Object} data - Recruitment data
 * @returns {boolean} True if has voice channel ID
 */
function hasVoiceChannelId(data) {
  return data && data.voiceChannelId && data.voiceChannelId.length > 0;
}

/**
 * Checks if user is the recruiter
 * @param {string} userId - User ID to check
 * @param {Object} data - Recruitment data
 * @returns {boolean} True if user is recruiter
 */
function isRecruiter(userId, data) {
  return data && String(data.recruiterId) === String(userId);
}

/**
 * Checks if participants array is valid and not empty
 * @param {Array} participants - Participants array
 * @returns {boolean} True if valid
 */
function hasValidParticipants(participants) {
  return Array.isArray(participants) && participants.length > 0;
}

/**
 * Checks if recruitment should use default notification
 * @param {string} selectedRole - Selected notification role
 * @param {Array} configuredIds - Configured role IDs
 * @returns {boolean} True if should use default
 */
function shouldUseDefaultNotification(selectedRole, configuredIds) {
  return !selectedRole && (!configuredIds || configuredIds.length === 0);
}

/**
 * Checks if channel is different from primary channel
 * @param {string} channelId - Channel ID to check
 * @param {string} primaryChannelId - Primary channel ID
 * @returns {boolean} True if different
 */
function isDifferentChannel(channelId, primaryChannelId) {
  return channelId && channelId !== primaryChannelId;
}

/**
 * Checks if error is a permission error
 * @param {Error} error - Error to check
 * @returns {boolean} True if permission error
 */
function isPermissionError(error) {
  return error && (error.code === 50001 || error.code === 50013);
}

/**
 * Checks if error is unknown interaction error
 * @param {Error} error - Error to check
 * @returns {boolean} True if unknown interaction
 */
function isUnknownInteractionError(error) {
  return error && error.code === 10062;
}

module.exports = {
  isValidParticipantsNumber,
  isValidStartDelay,
  isImmediateStartTime,
  isValidHexColor,
  hasNotificationRole,
  hasVoiceChat,
  hasVoiceChannelId,
  isRecruiter,
  hasValidParticipants,
  shouldUseDefaultNotification,
  isDifferentChannel,
  isPermissionError,
  isUnknownInteractionError
};
