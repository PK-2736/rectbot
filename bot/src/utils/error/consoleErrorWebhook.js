function resolveWebhookUrl() {
  return [
    process.env.RECRUIT_WEBHOOK_URL,
    process.env.DISCORD_WEBHOOK_URL,
    process.env.DISCORD_ALERT_WEBHOOK_URL,
    process.env.WEBHOOK_URL,
  ]
    .map((v) => String(v || '').trim())
    .find(Boolean) || null;
}

function serializeArg(arg) {
  if (arg instanceof Error) {
    return [arg.name, arg.message, arg.stack].filter(Boolean).join('\n');
  }
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function createDigest(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function buildDescription(message) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return '(empty error message)';
  return trimmed.length > 1800 ? `${trimmed.slice(0, 1800)}...` : trimmed;
}

function setupConsoleErrorWebhookForwarder() {
  const enabledRaw = String(process.env.ERROR_WEBHOOK_ENABLED || 'true').trim().toLowerCase();
  const enabled = ['1', 'true', 'yes', 'on'].includes(enabledRaw);
  if (!enabled) return;

  const webhookUrl = resolveWebhookUrl();
  if (!webhookUrl) return;

  const originalConsoleError = console.error.bind(console);
  const dedupeWindowMs = 15 * 1000;
  const recentlySent = new Map();

  const postToWebhook = async (text) => {
    const now = Date.now();
    const key = createDigest(text);
    const lastAt = recentlySent.get(key) || 0;
    if ((now - lastAt) < dedupeWindowMs) return;
    recentlySent.set(key, now);

    const description = buildDescription(text);
    const payload = {
      embeds: [
        {
          title: 'rectbot-server error log',
          color: 0xDC2626,
          description: `\`\`\`${description}\`\`\``,
          fields: [
            { name: 'env', value: String(process.env.NODE_ENV || 'unknown'), inline: true },
            { name: 'site', value: String(process.env.SITE_ID || 'unknown'), inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        originalConsoleError('[error-webhook] failed to send:', res.status);
      }
    } catch (err) {
      originalConsoleError('[error-webhook] notify failed:', err?.message || err);
    }
  };

  console.error = (...args) => {
    originalConsoleError(...args);

    const text = args.map(serializeArg).join(' ').trim();
    if (!text) return;
    if (text.includes('[error-webhook]')) return;

    void postToWebhook(text);
  };

  originalConsoleError('[error-webhook] enabled');
}

module.exports = {
  setupConsoleErrorWebhookForwarder,
};
