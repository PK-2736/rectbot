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

export async function sendToSentry(env, error, extra = {}, ctx = null) {
  try {
    if (!env || !env.SENTRY_DSN) return;
    const dsn = env.SENTRY_DSN;
    const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
    if (!m) return;
    const publicKey = m[1];
    const host = m[2];
    const projectId = m[3];
    const storeUrl = `https://${host}/api/${projectId}/store/?sentry_key=${publicKey}`;

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

    const body = JSON.stringify(event);

    if (ctx && typeof ctx.waitUntil === 'function') {
      try {
        ctx.waitUntil(fetch(storeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'rectbot-worker/0.1' },
          body
        }));
      } catch (e) {
        console.warn('sendToSentry (ctx.waitUntil) failed', e);
      }
      return;
    }

    await fetch(storeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'rectbot-worker/0.1' },
      body
    });
  } catch (e) {
    console.warn('sendToSentry failed', e);
  }
}
