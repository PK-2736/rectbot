/**
 * D1 Friend Code CRUD
 */

export async function addFriendCode({ db, userId, guildId, gameName, friendCode, originalGameName = null }) {
  try {
    await db.prepare(
      `INSERT INTO friend_codes (user_id, guild_id, game_name, friend_code, original_game_name)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, guild_id, game_name) DO UPDATE SET
       friend_code = excluded.friend_code,
       original_game_name = excluded.original_game_name,
       updated_at = CURRENT_TIMESTAMP`
    ).bind(userId, guildId, gameName, friendCode, originalGameName || gameName).run();

    // 統計更新
    await db.prepare(
      `INSERT INTO game_usage_stats (game_name, usage_count, last_used_at)
       VALUES (?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(game_name) DO UPDATE SET
       usage_count = usage_count + 1,
       last_used_at = CURRENT_TIMESTAMP`
    ).bind(gameName).run();

    return true;
  } catch (error) {
    console.error('[D1 Add Friend Code]', error);
    throw error;
  }
}

export async function getFriendCodes(db, userId, guildId, gameName = null) {
  try {
    let query, bindings;

    if (gameName) {
      query = `SELECT game_name, friend_code, original_game_name, created_at, updated_at
               FROM friend_codes
               WHERE user_id = ? AND guild_id = ? AND (game_name = ? OR original_game_name = ?)`;
      bindings = [userId, guildId, gameName, gameName];
    } else {
      query = `SELECT game_name, friend_code, original_game_name, created_at, updated_at
               FROM friend_codes
               WHERE user_id = ? AND guild_id = ?
               ORDER BY game_name ASC`;
      bindings = [userId, guildId];
    }

    const result = await db.prepare(query).bind(...bindings).all();
    return result.results || [];
  } catch (error) {
    console.error('[D1 Get Friend Codes]', error);
    return [];
  }
}

export async function deleteFriendCode(db, userId, guildId, gameName) {
  try {
    const result = await db.prepare(
      'DELETE FROM friend_codes WHERE user_id = ? AND guild_id = ? AND game_name = ?'
    ).bind(userId, guildId, gameName).run();

    return result.success && result.meta.changes > 0;
  } catch (error) {
    console.error('[D1 Delete Friend Code]', error);
    return false;
  }
}

export async function getPopularGames(db, limit = 20) {
  try {
    const result = await db.prepare(
      'SELECT game_name, usage_count FROM game_usage_stats ORDER BY usage_count DESC LIMIT ?'
    ).bind(limit).all();

    return result.results || [];
  } catch (error) {
    console.error('[D1 Get Popular Games]', error);
    return [];
  }
}
