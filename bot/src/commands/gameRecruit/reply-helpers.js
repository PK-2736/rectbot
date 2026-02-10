/**
 * Reply helper functions to reduce code duplication in handlers.js
 * Extracted to improve maintainability and reduce cyclomatic complexity
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../../utils/safeReply');

/**
 * Sends an ephemeral reply with no mentions allowed
 * @param {Object} interaction - Discord interaction
 * @param {Object} options - Reply options (content, embeds, etc.)
 */
async function replyEphemeral(interaction, options) {
  return await safeReply(interaction, {
    ...options,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { roles: [], users: [] }
  });
}

/**
 * Logs an error with context
 * @param {string} context - Context description (e.g., '[functionName]')
 * @param {Error|string} error - Error object or message
 */
function logError(context, error) {
  console.warn(`${context}:`, error?.message || error);
}

/**
 * Logs a warning with context
 * @param {string} context - Context description
 * @param {string} message - Warning message
 */
function logWarning(context, message) {
  console.warn(`${context}: ${message}`);
}

/**
 * Logs an error as console.error
 * @param {string} context - Context description
 * @param {Error|string} error - Error object or message
 */
function logCriticalError(context, error) {
  console.error(`${context}:`, error);
}

module.exports = {
  replyEphemeral,
  logError,
  logWarning,
  logCriticalError
};
