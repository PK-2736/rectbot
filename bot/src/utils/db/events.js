const EventEmitter = require('events');

const dbEvents = new EventEmitter();
let lastCleanup = { lastRun: null, deletedRecruitCount: 0, deletedParticipantCount: 0, error: null };

function setLastCleanupStatus(status) {
  lastCleanup = { ...lastCleanup, ...status };
  try { dbEvents.emit('cleanup', lastCleanup); } catch (_) {}
}

function getLastCleanupStatus() {
  return lastCleanup;
}

module.exports = { dbEvents, setLastCleanupStatus, getLastCleanupStatus };
