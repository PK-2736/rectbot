const cryptoModule = require('crypto');
const http = require('http');
const { generateRecruitCard } = require('../canvas/canvasRecruit');

const JWT_PRIVATE_KEY = (process.env.JWT_PRIVATE_KEY || '').trim();
const INTERNAL_SECRET = (process.env.INTERNAL_SECRET || '').trim();
const JWT_TTL_SEC = Number(process.env.JWT_USER_TTL_SEC || 3600);
const ISSUER_HOST = process.env.JWT_ISSUER_HOST || '0.0.0.0';

function resolveIssuerPort() {
  const raw = String(process.env.JWT_ISSUER_PORT || '').trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  // dev/prod を同居させるときのポート競合を避ける
  return String(process.env.NODE_ENV || '').toLowerCase() === 'development' ? 3003 : 3002;
}

function isIssuerEnabled() {
  const raw = String(process.env.JWT_ISSUER_ENABLED || 'true').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
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

function parseRequestUrl(req) {
  try {
    return new URL(req.url || '/', 'http://internal.local');
  } catch (_err) {
    return new URL('http://internal.local/');
  }
}

function resolveBotToken() {
  return String(process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
}

async function fetchDiscordJson(path, options = {}) {
  const token = resolveBotToken();
  if (!token) {
    return { ok: false, status: 503, json: { error: 'bot_token_missing' } };
  }

  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    json: payload,
  };
}

function mapButtonStyle(style) {
  const normalized = String(style || '').trim().toLowerCase();
  if (normalized === 'secondary') return 2;
  if (normalized === 'success') return 3;
  if (normalized === 'danger') return 4;
  return 1;
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

async function handleInternalGuildChannels(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!INTERNAL_SECRET) return sendJson(res, 503, { error: 'internal_secret_missing' });

  const provided = req.headers['x-internal-secret'] || '';
  if (provided !== INTERNAL_SECRET) return sendJson(res, 401, { error: 'unauthorized' });

  const url = parseRequestUrl(req);
  const guildId = String(url.searchParams.get('guildId') || '').trim();
  if (!guildId) return sendJson(res, 400, { error: 'guildId_required' });

  const discord = await fetchDiscordJson(`/guilds/${encodeURIComponent(guildId)}/channels`, { method: 'GET' });
  if (!discord.ok) {
    return sendJson(res, discord.status || 502, {
      error: 'discord_api_failed',
      detail: discord.json,
    });
  }

  const channels = Array.isArray(discord.json) ? discord.json : [];
  const sendable = channels
    .filter((ch) => ch && (ch.type === 0 || ch.type === 5))
    .sort((a, b) => {
      const posA = Number(a?.position || 0);
      const posB = Number(b?.position || 0);
      if (posA !== posB) return posA - posB;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    })
    .map((ch) => ({
      id: String(ch.id || ''),
      name: String(ch.name || ''),
      type: Number(ch.type || 0),
      parentId: ch.parent_id ? String(ch.parent_id) : null,
      position: Number(ch.position || 0),
    }))
    .filter((ch) => ch.id && ch.name);

  return sendJson(res, 200, { channels: sendable });
}

async function handleSendRecruitTemplateButton(req, res) {
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
  const channelId = String(body?.channelId || '').trim();
  const templateName = String(body?.templateName || '').trim();
  const buttonLabel = String(body?.buttonLabel || '').trim() || '募集を作成';
  const buttonStyle = mapButtonStyle(body?.buttonStyle);
  const embedTitle = String(body?.embedTitle || '').trim() || '募集作成';
  const embedDescription = String(body?.embedDescription || '').trim() || '下のボタンから募集を作成できます。';

  if (!guildId) return sendJson(res, 400, { error: 'guildId_required' });
  if (!channelId) return sendJson(res, 400, { error: 'channelId_required' });
  if (!templateName) return sendJson(res, 400, { error: 'templateName_required' });

  const discord = await fetchDiscordJson(`/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    body: {
      embeds: [{
        title: embedTitle.slice(0, 256),
        description: embedDescription.slice(0, 4000),
        color: 0x5865f2,
      }],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: buttonStyle,
              custom_id: 'open_template_recruit',
              label: buttonLabel.slice(0, 80),
            }
          ]
        }
      ]
    }
  });

  if (!discord.ok) {
    return sendJson(res, discord.status || 502, {
      error: 'discord_api_failed',
      detail: discord.json,
    });
  }

  const messageId = String(discord?.json?.id || '').trim();
  if (!messageId) {
    return sendJson(res, 502, { error: 'message_id_missing' });
  }

  try {
    const { saveTemplateButtonLink } = require('../database');
    await saveTemplateButtonLink(messageId, {
      templateName,
      guildId,
      channelId,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[internal/template-button] failed to save message-template mapping:', err?.message || err);
  }

  return sendJson(res, 200, {
    ok: true,
    guildId,
    channelId,
    messageId,
    templateName,
  });
}

function requestHandler(req, res) {
  const pathName = parseRequestUrl(req).pathname;
  if (req.url === '/internal/jwt/issue') {
    return void handleIssueJwt(req, res);
  }
  if (req.url === '/internal/recruit-preview') {
    return void handleRecruitPreview(req, res);
  }
  if (pathName === '/internal/discord/channels') {
    return void handleInternalGuildChannels(req, res);
  }
  if (pathName === '/internal/recruit-template-button/send') {
    return void handleSendRecruitTemplateButton(req, res);
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
}

function startJwtIssuerServer() {
  if (!isIssuerEnabled()) {
    console.log('[jwt-issuer] Disabled by JWT_ISSUER_ENABLED=false');
    return null;
  }

  if (!JWT_PRIVATE_KEY || !INTERNAL_SECRET) {
    console.warn('[jwt-issuer] Disabled: JWT_PRIVATE_KEY or INTERNAL_SECRET missing.');
    return null;
  }

  const issuerPort = resolveIssuerPort();
  const server = http.createServer(requestHandler);
  server.listen(issuerPort, ISSUER_HOST, () => {
    console.log(`[jwt-issuer] Listening on http://${ISSUER_HOST}:${issuerPort}`);
  });
  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      console.warn(`[jwt-issuer] Port already in use (${ISSUER_HOST}:${issuerPort}). Skip internal JWT issuer start.`);
      return;
    }
    console.error('[jwt-issuer] Server error:', err);
  });
  return server;
}

module.exports = { startJwtIssuerServer };
