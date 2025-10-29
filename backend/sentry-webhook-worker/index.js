// Cloudflare Worker: Sentry webhook receiver
// Receives Sentry webhook POSTs and forwards to Discord + optional Supabase
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, globalThis.__ENV || {}));
});

async function handleRequest(request, env) {
  // env bindings are provided by wrangler (see wrangler.toml)
  const SECRET = env.INTERNAL_SENTRY_SECRET || env.SENTRY_WEBHOOK_SECRET || '';
  const DISCORD_WEBHOOK = env.DISCORD_ERROR_WEBHOOK_URL || '';
  const SUPABASE_URL = env.SUPABASE_URL || '';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
  // Optional: Pages dashboard endpoint to receive Sentry events for unified UI
  const DASHBOARD_API_URL = env.DASHBOARD_API_URL || '';
  const DASHBOARD_API_KEY = env.DASHBOARD_API_KEY || '';
  // Optional: Loki push URL for Grafana (e.g. http://loki:3100/loki/api/v1/push)
  const LOKI_PUSH_URL = env.LOKI_PUSH_URL || '';
  const LOKI_TENANT = env.LOKI_TENANT || '';
  const LOKI_AUTH_HEADER = env.LOKI_AUTH_HEADER || '';

  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // Signature / secret verification
  // Preferred: HMAC signature via header 'x-sentry-signature' (hex of sha256)
  // Fallback: simple header 'x-sentry-secret' equals SECRET
  const incomingSig = request.headers.get('x-sentry-signature') || '';
  const incomingSecret = request.headers.get('x-sentry-secret') || request.headers.get('sentry-hook-secret') || '';
  if (incomingSig && SECRET) {
    try {
      // compute HMAC-SHA256 of bodyText with SECRET
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyText || ''));
      const sigArray = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (sigArray !== incomingSig) {
        return new Response('unauthorized', { status: 401 });
      }
    } catch (e) {
      return new Response('unauthorized', { status: 401 });
    }
  } else {
    if (!SECRET || incomingSecret !== SECRET) {
      return new Response('unauthorized', { status: 401 });
    }
  }

  let bodyText = await request.text();
  let payload = {};
  try {
    payload = JSON.parse(bodyText || '{}');
  } catch (e) {
    // proceed with raw text
    payload = { raw: bodyText };
  }

  // Build a concise Discord message
  const title = payload?.issue?.title || payload?.event?.message || payload?.message || 'Sentry event';
  const culprit = payload?.issue?.culprit || payload?.event?.culprit || '';
  const level = payload?.level || payload?.event?.level || '';
  const url = payload?.issue?.permalink || payload?.url || '';
  const project = payload?.project || (payload?.issue?.project_slug || 'unknown');

  // Idempotency: dedupe by event id (if present). Use Cloudflare KV via env.SENTRY_DEDUPE_KV binding.
  const eventId = payload?.event_id || payload?.issue?.id || payload?.id || payload?.group_id || null;
  if (eventId && env.SENTRY_DEDUPE_KV) {
    try {
      const seen = await env.SENTRY_DEDUPE_KV.get(String(eventId));
      if (seen) {
        // already processed
        return new Response('ok', { status: 200 });
      }
      // mark seen for 7 days
      await env.SENTRY_DEDUPE_KV.put(String(eventId), '1', { expirationTtl: 60 * 60 * 24 * 7 });
    } catch (e) {
      // best-effort: continue if KV is unavailable
      console.error('dedupe kv failed', e);
    }
  }

  const discordBody = {
    username: 'rectbot-sentry',
    embeds: [
      {
        title: title,
        url: url || undefined,
        description: `${culprit ? `Culprit: ${culprit}\n` : ''}${level ? `Level: ${level}\n` : ''}`,
        fields: [
          { name: 'Project', value: String(project), inline: true },
          { name: 'Type', value: payload?.action || payload?.type || 'event', inline: true }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  };

  // Post to Discord (best-effort)
  if (DISCORD_WEBHOOK) {
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordBody)
      });
    } catch (err) {
      // log but don't fail
      console.error('discord notify failed', err);
    }
  }

  // Optionally persist to Supabase via REST API (requires table `sentry_errors`)
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const rec = {
        title: title,
        project: project,
        payload: payload,
        received_at: new Date().toISOString()
      };
      await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sentry_errors`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(rec)
      });
    } catch (err) {
      console.error('supabase persist failed', err);
    }
  }

  // Optionally POST to Pages dashboard API (for unified management UI)
  if (DASHBOARD_API_URL) {
    try {
      const dashBody = {
        title,
        project,
        level,
        culprit,
        url,
        received_at: new Date().toISOString(),
        raw: payload
      };
      const headers = { 'Content-Type': 'application/json' };
      if (DASHBOARD_API_KEY) headers['Authorization'] = `Bearer ${DASHBOARD_API_KEY}`;
      await fetch(DASHBOARD_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(dashBody)
      });
    } catch (err) {
      console.error('dashboard notify failed', err);
    }
  }

  // Optionally push to Loki for Grafana logging (best-effort)
  if (LOKI_PUSH_URL) {
    try {
      const ts = Date.now() * 1000000; // nanoseconds
      const line = JSON.stringify({ title, project, level, culprit, url });
      const lokiPush = {
        streams: [
          {
            stream: { job: 'sentry', project: String(project) },
            values: [[String(ts), line]]
          }
        ]
      };
  const headers = { 'Content-Type': 'application/json' };
  if (LOKI_TENANT) headers['X-Scope-OrgID'] = LOKI_TENANT;
  if (LOKI_AUTH_HEADER) headers['Authorization'] = LOKI_AUTH_HEADER;
  // Use secure TLS endpoint (https) through OCI tunnel (garifana.rectbot.tech)
  await fetch(LOKI_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(lokiPush) });
    } catch (err) {
      console.error('loki push failed', err);
    }
  }

  return new Response('ok', { status: 200 });
}
