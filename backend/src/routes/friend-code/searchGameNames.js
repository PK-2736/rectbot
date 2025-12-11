/**
 * ゲーム名検索エンドポイント（オートコンプリート用）
 */

import { searchSimilarGames } from '../../ai/vectorize';
import { getPopularGames } from '../../db/friendCodes';

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function errorResponse(message, status = 500, headers = {}) {
  return jsonResponse({ success: false, error: message }, status, headers);
}

export async function handleSearchGameNames(request, env, corsHeaders = {}) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query) {
      // クエリがない場合は人気ゲームを返す
      const popular = await getPopularGames(env.FRIEND_CODE_DB, 25);
      return jsonResponse({
        success: true,
        games: popular.map(g => g.game_name)
      }, 200, corsHeaders);
    }

    // Vectorize で類似検索
    const results = await searchSimilarGames(env.AI, env.GAME_VECTORIZE, query, 10);

    return jsonResponse({
      success: true,
      games: results.map(r => r.gameName),
      details: results
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[searchGameNames]', error);
    return errorResponse(error.message, 500, corsHeaders);
  }
}
