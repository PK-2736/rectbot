// Shared in-memory state for gameRecruit command

// Participants keyed by messageId
const recruitParticipants = new Map();

// Per-user pending options between slash and modal (e.g., panelColor, notificationRoleId)
const pendingModalOptions = new Map();

async function __hydrateParticipants(messageId, participants) {
  try {
    if (!messageId || !Array.isArray(participants)) return;
    recruitParticipants.set(messageId, participants);
    console.log('[hydrate] set participants for', messageId, participants.length);
  } catch (e) {
    console.warn('[hydrate] failed to set participants:', e?.message || e);
  }
}

module.exports = {
  recruitParticipants,
  pendingModalOptions,
  __hydrateParticipants,
};
