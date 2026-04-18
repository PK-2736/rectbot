const { ensureRedisConnection } = require('./redis');

function normalizeMessageId(messageId) {
  const id = String(messageId || '').trim();
  return id || null;
}

function buildKey(messageId) {
  return `template_button_link:${messageId}`;
}

async function saveTemplateButtonLink(messageId, payload) {
  const normalized = normalizeMessageId(messageId);
  if (!normalized) return false;

  const client = await ensureRedisConnection();
  const value = JSON.stringify({
    templateName: String(payload?.templateName || '').trim(),
    guildId: String(payload?.guildId || '').trim(),
    channelId: String(payload?.channelId || '').trim(),
    createdAt: payload?.createdAt || new Date().toISOString(),
  });

  await client.set(buildKey(normalized), value);
  return true;
}

async function getTemplateButtonLink(messageId) {
  const normalized = normalizeMessageId(messageId);
  if (!normalized) return null;

  const client = await ensureRedisConnection();
  const raw = await client.get(buildKey(normalized));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const templateName = String(parsed.templateName || '').trim();
    if (!templateName) return null;
    return {
      templateName,
      guildId: String(parsed.guildId || '').trim() || null,
      channelId: String(parsed.channelId || '').trim() || null,
      createdAt: parsed.createdAt || null,
    };
  } catch (_err) {
    return null;
  }
}

module.exports = {
  saveTemplateButtonLink,
  getTemplateButtonLink,
};
