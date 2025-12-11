const redis = require('../../config/redis');

/**
 * フレンドコードをRedisに保存
 * Key: friend_code:{guildId}:{userId}:{normalizedGameName}
 * Value: JSON { code, gameName, createdAt }
 */
async function saveFriendCode(userId, guildId, normalizedGameName, code, originalGameName) {
  const key = `friend_code:${guildId}:${userId}:${normalizedGameName}`;
  const data = {
    code,
    gameName: normalizedGameName,
    originalInput: originalGameName,
    createdAt: new Date().toISOString()
  };
  await redis.set(key, JSON.stringify(data));
}

/**
 * 特定ゲームのフレンドコードを取得
 */
async function getFriendCode(userId, guildId, normalizedGameName) {
  const key = `friend_code:${guildId}:${userId}:${normalizedGameName}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * ユーザーの全フレンドコードを取得
 */
async function getAllFriendCodes(userId, guildId) {
  const pattern = `friend_code:${guildId}:${userId}:*`;
  const keys = await redis.keys(pattern);
  
  if (!keys || keys.length === 0) return [];
  
  const codes = [];
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      codes.push(JSON.parse(data));
    }
  }
  
  return codes.sort((a, b) => a.gameName.localeCompare(b.gameName));
}

/**
 * フレンドコードを削除
 */
async function deleteFriendCode(userId, guildId, normalizedGameName) {
  const key = `friend_code:${guildId}:${userId}:${normalizedGameName}`;
  await redis.del(key);
}

/**
 * ゲーム名パターンで検索（曖昧検索用）
 */
async function searchFriendCodeByPattern(userId, guildId, searchPattern) {
  const allCodes = await getAllFriendCodes(userId, guildId);
  
  const lowerPattern = searchPattern.toLowerCase();
  return allCodes.filter(code => 
    code.gameName.toLowerCase().includes(lowerPattern) ||
    code.originalInput.toLowerCase().includes(lowerPattern)
  );
}

module.exports = {
  saveFriendCode,
  getFriendCode,
  getAllFriendCodes,
  deleteFriendCode,
  searchFriendCodeByPattern
};
