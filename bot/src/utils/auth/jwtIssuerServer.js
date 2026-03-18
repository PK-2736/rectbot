const cryptoModule = require('crypto');
const http = require('http');
const { REST, Routes } = require('discord.js');
const { generateRecruitCard } = require('../canvas/canvasRecruit');

const JWT_PRIVATE_KEY = (process.env.JWT_PRIVATE_KEY || '').trim();
const INTERNAL_SECRET = (process.env.INTERNAL_SECRET || '').trim();
const JWT_TTL_SEC = Number(process.env.JWT_USER_TTL_SEC || 3600);
const ISSUER_PORT = Number(process.env.JWT_ISSUER_PORT || 3002);
const ISSUER_HOST = process.env.JWT_ISSUER_HOST || '0.0.0.0';
const DISCORD_BOT_TOKEN = (process.env.DISCORD_BOT_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();

const PREMIUM_COMMAND_MODULES = [
  require('../../commands/rectTemplate'),
];
const PREMIUM_COMMAND_DEFS = PREMIUM_COMMAND_MODULES
  .filter((cmd) => cmd?.data && typeof cmd.data.toJSON === 'function')
  .map((cmd) => cmd.data.toJSON());
const PREMIUM_COMMAND_NAMES = new Set(PREMIUM_COMMAND_DEFS.map((c) => String(c.name)));

let discordRestClient = null;
function getDiscordRestClient() {
  if (!DISCORD_BOT_TOKEN) return null;
  if (!discordRestClient) {
    discordRestClient = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
  }
  return discordRestClient;
}

function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function base64UrlFromBase64(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  const data = `${headerB64}.${payloadB64}`;
  const signer = cryptoModule.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const sig = signer.sign(privateKey, 'base64');
  return `${data}.${base64UrlFromBase64(sig)}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function sendBinary(res, status, buffer, contentType = 'application/octet-stream') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store'
  });
  res.end(buffer);
}

function normalizeAccentColor(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : null;
}

function buildPreviewRecruitData(body) {
  const form = body?.form || {};
  const layout = body?.layout || null;
  const voiceText = String(form.voicePlace || '').trim();
  const normalizedVoice = voiceText.includes('なし') ? 'なし' : (voiceText ? 'あり' : '指定なし');

  return {
    title: form.title || '参加者募集',
    description: form.content || 'ガチエリア / 初心者歓迎',
    content: form.content || 'ガチエリア / 初心者歓迎',
    startTime: form.startTimeText || '今から',
    voice: normalizedVoice,
    voicePlace: voiceText && !voiceText.includes('なし') ? voiceText : null,
    maxMembers: Number(form.participants) || 4,
    metadata: {
      startLabel: form.startTimeText || '今から',
      // Editor preview should stay in template mode from the first render
      // so dragging nodes does not cause a sudden mode switch.
      forceTemplateMode: true,
    },
    template: {
      layout_json: layout,
      background_image_url: form.backgroundImageUrl || null,
    },
  };
}

async function handleIssueJwt(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!INTERNAL_SECRET) return sendJson(res, 503, { error: 'internal_secret_missing' });
  if (!JWT_PRIVATE_KEY) return sendJson(res, 503, { error: 'private_key_missing' });

  const provided = req.headers['x-internal-secret'] || '';
  if (provided !== INTERNAL_SECRET) return sendJson(res, 401, { error: 'unauthorized' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid_json', detail: err.message });
  }

  const userId = body.userId || body.user_id;
  const username = body.username || body.user_name || 'unknown';
  const role = body.role === 'admin' ? 'admin' : 'user';
  if (!userId) return sendJson(res, 400, { error: 'missing_user_id' });

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    userId: String(userId),
    username: String(username),
    role,
    iat: nowSec,
    exp: nowSec + Math.max(60, JWT_TTL_SEC)
  };

  const jwt = signJwt(payload, JWT_PRIVATE_KEY);
  return sendJson(res, 200, { jwt });
}

async function handleRecruitPreview(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!INTERNAL_SECRET) return sendJson(res, 503, { error: 'internal_secret_missing' });

  const provided = req.headers['x-internal-secret'] || '';
  if (provided !== INTERNAL_SECRET) return sendJson(res, 401, { error: 'unauthorized' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid_json', detail: err.message });
  }

  try {
    const recruitData = buildPreviewRecruitData(body);
    const participantIds = [];
    const avatarUrls = null;
    const accentColor = normalizeAccentColor(body?.form?.color);
    const buffer = await generateRecruitCard(recruitData, participantIds, null, accentColor, avatarUrls);
    return sendBinary(res, 200, buffer, 'image/png');
  } catch (err) {
    return sendJson(res, 500, { error: 'preview_generation_failed', detail: err?.message || String(err) });
  }
}

async function syncPremiumCommands(guildId, enabled) {
  if (!guildId) throw new Error('guildId is required');
  if (!CLIENT_ID) throw new Error('CLIENT_ID is missing');
  const rest = getDiscordRestClient();
  if (!rest) throw new Error('DISCORD_BOT_TOKEN is missing');

  const current = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, String(guildId)));
  const currentList = Array.isArray(current) ? current : [];
  const base = currentList.filter((cmd) => !PREMIUM_COMMAND_NAMES.has(String(cmd.name)));
  const next = enabled ? [...base, ...PREMIUM_COMMAND_DEFS] : base;

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, String(guildId)),
    { body: next }
  );

  return { guildId: String(guildId), enabled: !!enabled, commandCount: next.length };
}

async function handleSyncPremiumCommands(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!INTERNAL_SECRET) return sendJson(res, 503, { error: 'internal_secret_missing' });

  const provided = req.headers['x-internal-secret'] || '';
  if (provided !== INTERNAL_SECRET) return sendJson(res, 401, { error: 'unauthorized' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'invalid_json', detail: err.message });
  }

  const guildId = String(body?.guildId || '').trim();
  const enabled = !!body?.enabled;
  if (!guildId) return sendJson(res, 400, { error: 'guild_id_required' });

  try {
    const result = await syncPremiumCommands(guildId, enabled);
    return sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJson(res, 500, { error: 'premium_command_sync_failed', detail: err?.message || String(err) });
  }
}

function requestHandler(req, res) {
  if (req.url === '/internal/jwt/issue') {
    return void handleIssueJwt(req, res);
  }
  if (req.url === '/internal/recruit-preview') {
    return void handleRecruitPreview(req, res);
  }
  if (req.url === '/internal/commands/sync-premium') {
    return void handleSyncPremiumCommands(req, res);
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
}

function startJwtIssuerServer() {
  if (!JWT_PRIVATE_KEY || !INTERNAL_SECRET) {
    console.warn('[jwt-issuer] Disabled: JWT_PRIVATE_KEY or INTERNAL_SECRET missing.');
    return null;
  }

  const server = http.createServer(requestHandler);
  server.listen(ISSUER_PORT, ISSUER_HOST, () => {
    console.log(`[jwt-issuer] Listening on http://${ISSUER_HOST}:${ISSUER_PORT}`);
  });
  server.on('error', (err) => {
    console.error('[jwt-issuer] Server error:', err);
  });
  return server;
}

module.exports = { startJwtIssuerServer };
