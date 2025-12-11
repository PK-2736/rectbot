/**
 * Cloudflare Worker API クライアント
 * Discord Bot から Worker API を呼び出す
 */

// 統合されたbackend Workerを使用（Friend Code APIも含む）
const WORKER_URL = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'https://api.recrubo.net';

/**
 * ゲーム名を正規化
 */
async function normalizeGameNameWithWorker(input, userId, guildId) {
  try {
    const response = await fetch(`${WORKER_URL}/api/game/normalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, userId, guildId })
    });

    if (!response.ok) {
      throw new Error(`Worker API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      normalized: data.normalized,
      confidence: data.confidence,
      method: data.method,
      matches: data.vectorizeMatches || []
    };

  } catch (error) {
    console.error('[Worker API] normalizeGameName error:', error);
    throw error;
  }
}

/**
 * フレンドコードを追加
 */
async function addFriendCodeToWorker(userId, guildId, gameName, friendCode) {
  try {
    const response = await fetch(`${WORKER_URL}/api/friend-code/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, guildId, gameName, friendCode })
    });

    if (!response.ok) {
      throw new Error(`Worker API error: ${response.status}`);
    }

    const data = await response.json();
    return data.success;

  } catch (error) {
    console.error('[Worker API] addFriendCode error:', error);
    throw error;
  }
}

/**
 * フレンドコードを取得
 */
async function getFriendCodesFromWorker(userId, guildId, gameName = null) {
  try {
    const params = new URLSearchParams({ userId, guildId });
    if (gameName) params.append('gameName', gameName);

    const response = await fetch(`${WORKER_URL}/api/friend-code/get?${params}`);

    if (!response.ok) {
      throw new Error(`Worker API error: ${response.status}`);
    }

    const data = await response.json();
    return data.codes || [];

  } catch (error) {
    console.error('[Worker API] getFriendCodes error:', error);
    throw error;
  }
}

/**
 * フレンドコードを削除
 */
async function deleteFriendCodeFromWorker(userId, guildId, gameName) {
  try {
    const response = await fetch(`${WORKER_URL}/api/friend-code/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, guildId, gameName })
    });

    if (!response.ok) {
      throw new Error(`Worker API error: ${response.status}`);
    }

    const data = await response.json();
    return data.success;

  } catch (error) {
    console.error('[Worker API] deleteFriendCode error:', error);
    throw error;
  }
}

/**
 * ゲーム名を検索（オートコンプリート用）
 */
async function searchGameNamesFromWorker(query) {
  try {
    const params = new URLSearchParams();
    if (query) params.append('q', query);

    const response = await fetch(`${WORKER_URL}/api/game/search?${params}`);

    if (!response.ok) {
      throw new Error(`Worker API error: ${response.status}`);
    }

    const data = await response.json();
    return data.games || [];

  } catch (error) {
    console.error('[Worker API] searchGameNames error:', error);
    return [];
  }
}

module.exports = {
  normalizeGameNameWithWorker,
  addFriendCodeToWorker,
  getFriendCodesFromWorker,
  deleteFriendCodeFromWorker,
  searchGameNamesFromWorker
};
