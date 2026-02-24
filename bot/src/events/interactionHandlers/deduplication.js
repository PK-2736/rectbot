/**
 * deduplication.js
 * Handles interaction deduplication
 */

const DEFAULT_DEDUPE_TTL_MS = 3000;

/**
 * Check if interaction has already been processed
 * @param {Object} client - Discord client
 * @param {string} interactionId - Interaction ID
 * @returns {boolean} - True if already processed
 */
function isAlreadyProcessed(client, interactionId) {
  try {
    return client?.processedInteractions?.has?.(interactionId) || false;
  } catch (error) {
    console.error('[isAlreadyProcessed] Error:', error);
    return false;
  }
}

/**
 * Mark interaction as processed and schedule cleanup
 * @param {Object} client - Discord client
 * @param {string} interactionId - Interaction ID
 */
function markAsProcessed(client, interactionId) {
  try {
    client?.processedInteractions?.add?.(interactionId);
    
    const ttl = client?.DEDUPE_TTL_MS || DEFAULT_DEDUPE_TTL_MS;
    setTimeout(() => {
      try {
        client?.processedInteractions?.delete?.(interactionId);
      } catch (_error) {
        // Silent cleanup failure
      }
    }, ttl);
  } catch (_error) {
    console.error('[markAsProcessed] Error during dedupe:', _error);
  }
}

/**
 * Deduplicate interaction - returns true if should skip
 * @param {Object} client - Discord client
 * @param {Object} interaction - Discord interaction
 * @returns {boolean} - True if interaction should be skipped (already processed)
 */
function deduplicateInteraction(client, interaction) {
  if (isAlreadyProcessed(client, interaction.id)) {
    return true; // Skip - already processed
  }
  
  markAsProcessed(client, interaction.id);
  return false; // Continue processing
}

module.exports = {
  deduplicateInteraction,
  isAlreadyProcessed,
  markAsProcessed
};
