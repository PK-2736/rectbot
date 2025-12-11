/**
 * ゲーム名検索エンドポイント（オートコンプリート用）
 */

import { searchSimilarGames } from '../ai/vectorize';
import { getPopularGames } from '../db/friendCodes';
import { jsonResponse, errorResponse } from '../utils/response';

export async function handleSearchGameNames(request, env) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query) {
      // クエリがない場合は人気ゲームを返す
      const popular = await getPopularGames(env.DB, 25);
      return jsonResponse({
        success: true,
        games: popular.map(g => g.game_name)
      });
    }

    // Vectorize で類似検索
    const results = await searchSimilarGames(env.AI, env.VECTORIZE, query, 10);

    return jsonResponse({
      success: true,
      games: results.map(r => r.gameName),
      details: results
    });

  } catch (error) {
    console.error('[searchGameNames]', error);
    return errorResponse(error.message, 500);
  }
}
