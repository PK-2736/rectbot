const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const backendFetch = require('./src/utils/backendFetch');

const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// Optional request debug logging. Enable by setting DEBUG_REQUESTS=true in the origin env.
if (process.env.DEBUG_REQUESTS && process.env.DEBUG_REQUESTS.toLowerCase() === 'true') {
  app.use((req, res, next) => {
    try {
      console.log(`[req-debug] ${new Date().toISOString()} ${req.method} ${req.originalUrl} from ${req.ip}`);
      // Print a small subset of headers to avoid leaking secrets in logs
      const hdrs = {
        host: req.headers.host,
        origin: req.headers.origin,
        referer: req.headers.referer,
        authorization: req.headers.authorization ? '[present]' : '[missing]',
        'x-internal-secret': req.headers['x-internal-secret'] ? '[present]' : '[missing]',
        'x-service-token': req.headers['x-service-token'] ? '[present]' : '[missing]'
      };
      console.log('[req-debug] headers:', hdrs);
    } catch (e) {
      console.warn('[req-debug] logging error', e && e.message);
    }
    next();
  });
}

// SERVICE_TOKEN middleware for authentication
function requireServiceToken(req, res, next) {
  const token = process.env.SERVICE_TOKEN;
  if (!token) {
    console.warn('[server] SERVICE_TOKEN not set; allowing service routes for development');
    return next();
  }
  
  const authHeader = req.headers.authorization || '';
  const tokenHeader = req.headers['x-service-token'] || '';
  
  let providedToken = '';
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    providedToken = authHeader.slice(7).trim();
  } else if (tokenHeader) {
    providedToken = tokenHeader.trim();
  }
  
  if (!providedToken || providedToken !== token) {
    return res.status(403).json({ error: 'forbidden', detail: 'valid service token required' });
  }
  
  next();
}

const PORT = process.env.PORT || 3000;
const BACKEND_API_URL = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'https://api.rectbot.tech';

function backendUrl(path) {
  return `${BACKEND_API_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
}

// Redis DB utilities from bot/src/utils/db.js
const db = require('./src/utils/db');

// Internal secret middleware - only allow requests that carry the internal secret header
function requireInternalSecret(req, res, next) {
  const internal = process.env.INTERNAL_SECRET || '';
  const header = req.headers['x-internal-secret'];
  if (!internal) {
    // In development if INTERNAL_SECRET is not set, allow but log a warning
    console.warn('[server] INTERNAL_SECRET not set; allowing internal routes for development');
    return next();
  }
  if (!header || header !== internal) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

// expose cleanup endpoints
app.get('/internal/cleanup/status', requireInternalSecret, async (req, res) => {
  try {
    const status = db.getLastCleanupStatus ? db.getLastCleanupStatus() : { lastRun: null };
    res.json(status);
  } catch (err) {
    console.error('[internal][cleanup][status] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// Manual cleanup trigger (protected)
app.post('/internal/cleanup/run', async (req, res) => {
  const secret = req.headers['x-deploy-secret'] || req.body?.secret;
  if (!process.env.DEPLOY_SECRET) return res.status(500).json({ error: 'server_misconfigured', detail: 'DEPLOY_SECRET not set on server' });
  if (!secret || secret !== process.env.DEPLOY_SECRET) return res.status(403).json({ error: 'forbidden' });
  try {
    const result = await db.runCleanupNow();
    // Optionally notify webhook
    if (process.env.CLEANUP_WEBHOOK_URL) {
      try {
        await fetch(process.env.CLEANUP_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'cleanup_run', result })
        });
      } catch (e) {
        console.warn('[internal][cleanup][run] webhook notify failed:', e.message || e);
      }
    }
    res.json(result);
  } catch (err) {
    console.error('[internal][cleanup][run] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

function normalizeRecruitId(idOrMessageId) {
  if (!idOrMessageId) return null;
  // If looks like a full Discord message id (long numeric), take last 8 chars as recruitId
  const s = String(idOrMessageId);
  if (s.length > 8) return s.slice(-8);
  return s;
}

// Health check - proxy to worker /api/test
app.get('/api/health', async (req, res) => {
  try {
  const r = await backendFetch('/api/test');
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (err) {
    console.error('[server][health] Error contacting backend:', err.message || err);
    res.status(502).json({ error: 'backend_unreachable', detail: err.message });
  }
});

// Basic root and health endpoints for origin
app.get('/', (req, res) => {
  // Simple origin identity - useful for Cloudflare fronting to show origin is healthy
  res.json({ ok: true, service: 'rectbot-origin', time: new Date().toISOString() });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// Proxy recruitment POST/GET (protected by SERVICE_TOKEN)
app.post('/api/recruitment', requireServiceToken, async (req, res) => {
  try {
    const r = await backendFetch('/api/recruitment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (err) {
    console.error('[server][recruitment][post] Error:', err.message || err);
    res.status(502).json({ error: 'backend_unreachable', detail: err.message });
  }
});

app.get('/api/recruitment', requireServiceToken, async (req, res) => {
  try {
    const url = new URL(backendUrl('/api/recruitment'));
    // forward query params
    Object.entries(req.query).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await backendFetch(url.toString());
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (err) {
    console.error('[server][recruitment][get] Error:', err.message || err);
    res.status(502).json({ error: 'backend_unreachable', detail: err.message });
  }
});

// --- Internal Redis-backed endpoints for recruits & participants ---
// List all recruits stored in Redis
app.get('/internal/recruits', async (req, res) => {
  try {
    const recruits = await db.listRecruitsFromRedis();
    res.json(recruits || []);
  } catch (err) {
    console.error('[internal][recruits][list] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// Get single recruit by id or full message id
app.get('/internal/recruits/:id', async (req, res) => {
  try {
    const raw = req.params.id;
    const recruitId = normalizeRecruitId(raw);
    const recruit = await db.getRecruitFromRedis(recruitId);
    if (!recruit) return res.status(404).json({ error: 'not_found' });
    res.json(recruit);
  } catch (err) {
    console.error('[internal][recruits][get] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// Create or update recruit (body should contain recruit object)
app.post('/internal/recruits', requireInternalSecret, async (req, res) => {
  try {
    const body = req.body || {};
    // determine recruitId: prefer body.recruitId, else derive from message_id or messageId
    let recruitId = body.recruitId || (body.message_id ? normalizeRecruitId(body.message_id) : null) || (body.messageId ? normalizeRecruitId(body.messageId) : null);
    if (!recruitId) {
      return res.status(400).json({ error: 'recruit_id_missing', detail: 'Provide recruitId or message_id/messageId' });
    }
    // store
    await db.saveRecruitToRedis(recruitId, body);
    const saved = await db.getRecruitFromRedis(recruitId);
    res.status(201).json(saved);
  } catch (err) {
    console.error('[internal][recruits][post] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// Delete recruit
app.delete('/internal/recruits/:id', requireInternalSecret, async (req, res) => {
  try {
    const recruitId = normalizeRecruitId(req.params.id);
    await db.deleteRecruitFromRedis(recruitId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[internal][recruits][delete] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// Push recruit to backend API (Worker)
app.post('/internal/recruits/:id/push', requireInternalSecret, async (req, res) => {
  try {
    const recruitId = normalizeRecruitId(req.params.id);
    const recruit = await db.getRecruitFromRedis(recruitId);
    if (!recruit) return res.status(404).json({ error: 'not_found' });
    const result = await db.pushRecruitToWebAPI(recruit);
    res.json(result);
  } catch (err) {
    console.error('[internal][recruits][push] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// Participants: keys use full message ID
app.get('/internal/participants/:messageId', requireInternalSecret, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const participants = await db.getParticipantsFromRedis(messageId);
    res.json(participants || []);
  } catch (err) {
    console.error('[internal][participants][get] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

app.post('/internal/participants/:messageId', requireInternalSecret, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const participants = Array.isArray(req.body) ? req.body : req.body.participants;
    if (!Array.isArray(participants)) return res.status(400).json({ error: 'invalid_participants', detail: 'Provide participants array in body or as raw array' });
    await db.saveParticipantsToRedis(messageId, participants);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[internal][participants][post] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

app.delete('/internal/participants/:messageId', requireInternalSecret, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    await db.deleteParticipantsFromRedis(messageId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[internal][participants][delete] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// Generic proxy for other backend endpoints
app.all('/api/*', async (req, res) => {
  try {
    const path = req.path.replace(/^\/api/, '') || '/';
    const url = backendUrl(`/api${path}`);

    const opts = {
      method: req.method,
      headers: { ...req.headers },
      redirect: 'follow'
    };

    // Remove host header (node-fetch will set)
    delete opts.headers.host;

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      opts.body = JSON.stringify(req.body);
      opts.headers['content-type'] = 'application/json';
    }

    // ensure Service Token present when proxying to backend
    if (!opts.headers.authorization && !opts.headers.Authorization) {
      const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
      if (svc) opts.headers.authorization = `Bearer ${svc}`;
    }

    const r = await fetch(url, opts);
    // try to return json, else text
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      res.status(r.status).json(j);
    } catch (e) {
      res.status(r.status).send(text);
    }
  } catch (err) {
    console.error('[server][proxy] Error:', err.message || err);
    res.status(502).json({ error: 'backend_unreachable', detail: err.message });
  }
});

// --- Redis-backed recruitment endpoints for web usage ---
// These let the frontend fetch the latest recruitment data directly from the bot's Redis cache.
// GET /api/redis/recruitment -> list all cached recruits
// GET /api/redis/recruitment/:id -> get single recruit by recruitId or full message id
// These require internal secret for security.

app.get('/api/redis/recruitment', requireInternalSecret, async (req, res) => {
  try {
    const recruits = await db.listRecruitsFromRedis();
    res.json(recruits || []);
  } catch (err) {
    console.error('[server][api/redis/recruitment][get] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

app.get('/api/redis/recruitment/:id', requireInternalSecret, async (req, res) => {
  try {
    const raw = req.params.id;
    const recruitId = normalizeRecruitId(raw);
    const recruit = await db.getRecruitFromRedis(recruitId);
    if (!recruit) return res.status(404).json({ error: 'not_found' });
    res.json(recruit);
  } catch (err) {
    console.error('[server][api/redis/recruitment][get:id] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[server] Express server listening on port ${PORT}, proxying to ${BACKEND_API_URL}`);
  // Debug: show which env-derived values are present (do not print secrets)
  console.log(`[server] env summary: BACKEND_API_URL=${process.env.BACKEND_API_URL || process.env.BACKEND_URL || ''}, DISCORD_BOT_TOKEN=${process.env.DISCORD_BOT_TOKEN ? 'set' : 'unset'}`);
});

// Protected endpoint to run command deployment from the server process.
// Use DEPLOY_SECRET in environment variables to authenticate the request.
app.post('/internal/deploy-commands', async (req, res) => {
  const secret = req.headers['x-deploy-secret'] || req.body?.secret;
  if (!process.env.DEPLOY_SECRET) return res.status(500).json({ error: 'server_misconfigured', detail: 'DEPLOY_SECRET not set on server' });
  if (!secret || secret !== process.env.DEPLOY_SECRET) return res.status(403).json({ error: 'forbidden' });
  // Ensure required env (DISCORD_BOT_TOKEN) is present before spawning deploy script
  if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('[internal/deploy-commands] DISCORD_BOT_TOKEN is not set; aborting spawn to avoid empty-token REST errors');
    return res.status(500).json({ error: 'server_misconfigured', detail: 'DISCORD_BOT_TOKEN not set in server environment' });
  }

  const scriptPath = path.join(__dirname, 'src', 'deploy-commands.js');
  const child = spawn(process.execPath, [scriptPath], { cwd: __dirname, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += String(d); });
  child.stderr.on('data', (d) => { stderr += String(d); });

  child.on('close', (code) => {
    res.json({ code, stdout, stderr });
  });
});
