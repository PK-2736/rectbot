require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BACKEND_API_URL = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'https://api.rectbot.tech';

function backendUrl(path) {
  return `${BACKEND_API_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
}

// Redis DB utilities from bot/src/utils/db.js
const db = require('./src/utils/db');

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
    const r = await fetch(backendUrl('/api/test'));
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (err) {
    console.error('[server][health] Error contacting backend:', err.message || err);
    res.status(502).json({ error: 'backend_unreachable', detail: err.message });
  }
});

// Proxy recruitment POST/GET
app.post('/api/recruitment', async (req, res) => {
  try {
    const r = await fetch(backendUrl('/api/recruitment'), {
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

app.get('/api/recruitment', async (req, res) => {
  try {
    const url = new URL(backendUrl('/api/recruitment'));
    // forward query params
    Object.entries(req.query).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url.toString());
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
app.post('/internal/recruits', async (req, res) => {
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
app.delete('/internal/recruits/:id', async (req, res) => {
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
app.post('/internal/recruits/:id/push', async (req, res) => {
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
app.get('/internal/participants/:messageId', async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const participants = await db.getParticipantsFromRedis(messageId);
    res.json(participants || []);
  } catch (err) {
    console.error('[internal][participants][get] Error:', err.message || err);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

app.post('/internal/participants/:messageId', async (req, res) => {
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

app.delete('/internal/participants/:messageId', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`[server] Express server listening on port ${PORT}, proxying to ${BACKEND_API_URL}`);
});
