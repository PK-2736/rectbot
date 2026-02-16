/**
 * Cloudflare Worker API クライアント
 * Discord Bot から Worker API を呼び出す
 */

// 統合されたbackend Workerを使用（Friend Code APIも含む）
const WORKER_URL = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'https://api.recrubo.net';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
const { fetchServiceJwt } = require('./serviceJwt');

/**
 * 共通ヘッダーを生成
 */
async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const jwt = await fetchServiceJwt();
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
  } catch (err) {
    console.warn('[Worker API] Failed to fetch service JWT, falling back to service token:', err?.message || err);
  }
  return headers;
}

function buildWorkerUrl(path) {
  if (path.startsWith('http')) return path;
  return `${WORKER_URL}${path}`;
}

async function requestWorkerJson(path, options = {}) {
  const {
    method = 'GET',
    body,
    errorLabel,
    defaultValue,
    allowFailure = false
  } = options;

  try {
    const response = await fetch(buildWorkerUrl(path), {
      method,
      headers: await getHeaders(),
      body
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error body');
      if (errorLabel) {
        console.error(`[Worker API] ${errorLabel} failed: ${response.status} - ${errorText}`);
      }
      if (allowFailure) return defaultValue;
      throw new Error(`Worker API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (errorLabel) {
      console.error(`[Worker API] ${errorLabel} error:`, error);
    }
    if (allowFailure) return defaultValue;
    throw error;
  }
}

/**
 * ゲーム名を正規化
 */
async function normalizeGameNameWithWorker(input, userId, guildId) {
  const data = await requestWorkerJson('/api/game/normalize', {
    method: 'POST',
    body: JSON.stringify({ input, userId, guildId }),
    errorLabel: 'normalizeGameName'
  });

  return {
    normalized: data.normalized,
    confidence: data.confidence,
    method: data.method,
    matches: data.vectorizeMatches || []
  };
}

/**
 * フレンドコードを検証
 */
async function validateFriendCodeWithWorker(gameName, friendCode) {
  const data = await requestWorkerJson('/api/friend-code/validate', {
    method: 'POST',
    body: JSON.stringify({ gameName, friendCode }),
    errorLabel: 'validateFriendCode'
  });

  return {
    isValid: data.isValid,
    confidence: data.confidence,
    message: data.message,
    suggestions: data.suggestions || []
  };
}

/**
 * フレンドコードを追加
 */
async function addFriendCodeToWorker(userId, guildId, gameName, friendCode, originalGameName = null) {
  const data = await requestWorkerJson('/api/friend-code/add', {
    method: 'POST',
    body: JSON.stringify({ userId, guildId, gameName, friendCode, originalGameName }),
    errorLabel: 'addFriendCode'
  });

  return data.success;
}

/**
 * フレンドコードを取得
 */
async function getFriendCodesFromWorker(userId, guildId, gameName = null) {
  const params = new URLSearchParams({ userId, guildId });
  if (gameName) params.append('gameName', gameName);

  const data = await requestWorkerJson(`/api/friend-code/get?${params}`, {
    errorLabel: 'getFriendCodes'
  });

  return data.codes || [];
}

/**
 * フレンドコードを削除
 */
async function deleteFriendCodeFromWorker(userId, guildId, gameName) {
  const data = await requestWorkerJson('/api/friend-code/delete', {
    method: 'DELETE',
    body: JSON.stringify({ userId, guildId, gameName }),
    errorLabel: 'deleteFriendCode'
  });

  return data.success;
}

/**
 * ゲーム名を検索（オートコンプリート用）
 */
async function searchGameNamesFromWorker(query) {
  const params = new URLSearchParams();
  if (query) params.append('q', query);

  const data = await requestWorkerJson(`/api/game/search?${params}`, {
    errorLabel: 'searchGameNames',
    defaultValue: { games: [] },
    allowFailure: true
  });

  return data.games || [];
}

module.exports = {
  normalizeGameNameWithWorker,
  validateFriendCodeWithWorker,
  addFriendCodeToWorker,
  getFriendCodesFromWorker,
  deleteFriendCodeFromWorker,
  searchGameNamesFromWorker
};
