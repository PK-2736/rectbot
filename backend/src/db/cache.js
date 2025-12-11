/**
 * D1 キャッシュ操作
 */

export async function getCachedGameName(db, inputName) {
  try {
    const result = await db.prepare(
      'SELECT normalized_name, confidence FROM game_name_cache WHERE input_name = ?'
    ).bind(inputName.toLowerCase()).first();

    return result;
  } catch (error) {
    console.error('[D1 Cache Get]', error);
    return null;
  }
}

export async function setCachedGameName(db, inputName, normalizedName, confidence = 1.0) {
  try {
    await db.prepare(
      `INSERT INTO game_name_cache (input_name, normalized_name, confidence)
       VALUES (?, ?, ?)
       ON CONFLICT(input_name) DO UPDATE SET
       normalized_name = excluded.normalized_name,
       confidence = excluded.confidence,
       created_at = CURRENT_TIMESTAMP`
    ).bind(inputName.toLowerCase(), normalizedName, confidence).run();

    return true;
  } catch (error) {
    console.error('[D1 Cache Set]', error);
    return false;
  }
}
