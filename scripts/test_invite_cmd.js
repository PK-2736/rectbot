const inviteCmd = require('../bot/src/commands/invite.js');
// Mock interaction object exposing reply/followUp/editReply properties
function makeInteraction() {
  let replied = false;
  const inter = {
    replied,
    deferred: false,
    async reply(options) {
      inter.replied = true;
      console.log('[mock] reply called with:', options);
      return { id: 'msg1' };
    },
    async followUp(options) {
      console.log('[mock] followUp called with:', options);
      return { id: 'msg2' };
    },
    async editReply(options) {
      console.log('[mock] editReply called with:', options);
      return { id: 'msg-edit' };
    },
    isChatInputCommand() { return true; }
  };
  return inter;
}

(async function test() {
  // Temporary stub for backendFetch; override the module's import using require.cache
  const backendFetch = require('../bot/src/utils/backendFetch');
  // We'll monkeypatch at runtime by editing the actual module used by require
  const originalFetch = backendFetch;
  const fakeResp = { ok: true, url: 'https://api.recrubo.net/api/bot-invite/t/demoToken' };

  require.cache[require.resolve('../bot/src/utils/backendFetch')].exports = async () => fakeResp;

  const inter = makeInteraction();
  try {
    await inviteCmd.execute(inter);
    console.log('invite.execute succeeded');
  } catch (e) {
    console.error('invite.execute failed:', e);
  }

  // Restore original backendFetch
  require.cache[require.resolve('../bot/src/utils/backendFetch')].exports = originalFetch;
})();
