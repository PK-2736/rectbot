// utils/sentry.js

function parseStackFrames(stack) {
  if (!stack) return [];
  const lines = String(stack).split('\n').slice(0, 50);
  const frames = [];
  const re = /\s*at\s+(.*?)\s+\(?(.+?):(\d+):(\d+)\)?/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const func = m[1] || '<anonymous>';
      const filename = m[2] || '<unknown>';
      const lineno = parseInt(m[3] || '0', 10) || 0;
      const colno = parseInt(m[4] || '0', 10) || 0;
      frames.push({ filename, function: func, lineno, colno, in_app: true });
    } else {
      frames.push({ filename: line.trim(), function: '<unknown>', lineno: 0, colno: 0, in_app: false });
    }
  }
  return frames.reverse();
}

function parseDsn(dsn) {
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!match) return null;
  return { publicKey: match[1], host: match[2], projectId: match[3] };
}

function buildSentryEvent(error, extra) {
  const errMsg = (error && (error.message || String(error))) || 'Unknown error';
  const exception = error ? {
    values: [{
      type: error.name || 'Error',
      value: errMsg,
      stacktrace: { frames: parseStackFrames(error.stack) }
    }]
  } : undefined;

  const event = {
    message: errMsg,
    exception,
    level: 'error',
    logger: 'rectbot.backend',
    platform: 'javascript',
    sdk: { name: 'custom.rectbot.worker', version: '0.1' },
    tags: { path: extra && extra.path ? String(extra.path) : undefined },
    extra: { ...extra, stack: error && error.stack },
    timestamp: new Date().toISOString(),
  };

  if (extra && extra.requestInfo) event.request = extra.requestInfo;
  return event;
}

async function postSentryEvent(storeUrl, event, ctx) {
  const body = JSON.stringify(event);
  const requestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'rectbot-worker/0.1' },
    body
  };

  if (ctx && typeof ctx.waitUntil === 'function') {
    try {
      ctx.waitUntil(fetch(storeUrl, requestInit));
    } catch (e) {
      console.warn('sendToSentry (ctx.waitUntil) failed', e);
    }
    return;
  }

  await fetch(storeUrl, requestInit);
}

export async function sendToSentry(env, error, extra = {}, ctx = null) {
  try {
    if (!env || !env.SENTRY_DSN) return;
    const parsed = parseDsn(env.SENTRY_DSN);
    if (!parsed) return;
    const storeUrl = `https://${parsed.host}/api/${parsed.projectId}/store/?sentry_key=${parsed.publicKey}`;
    const event = buildSentryEvent(error, extra);
    await postSentryEvent(storeUrl, event, ctx);
  } catch (e) {
    console.warn('sendToSentry failed', e);
  }
}
