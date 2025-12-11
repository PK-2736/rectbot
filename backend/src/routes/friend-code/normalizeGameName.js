/**
 * Workers AI を使用してゲーム名を正規化
 * 1. LLM でゲーム名候補を生成
 * 2. Vectorize で類似検索
 * 3. D1 キャッシュから取得
 */

import { generateGameNameWithLLM } from '../../ai/llm';
import { searchSimilarGames } from '../../ai/vectorize';
import { getCachedGameName, setCachedGameName } from '../../db/cache';

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function errorResponse(message, status = 500, headers = {}) {
  return jsonResponse({ success: false, error: message }, status, headers);
}

export async function handleNormalizeGameName(request, env, corsHeaders = {}) {
  try {
    const body = await request.json();
    const { input, userId, guildId } = body;

    if (!input || typeof input !== 'string') {
      return errorResponse('Invalid input', 400, corsHeaders);
    }

    const inputTrimmed = input.trim();

    // 1. キャッシュチェック
    const cached = await getCachedGameName(env.FRIEND_CODE_DB, inputTrimmed);
    if (cached) {
      return jsonResponse({
        normalized: cached.normalized_name,
        confidence: cached.confidence,
        method: 'cache',
        source: 'D1'
      });
    }

    // 2. Workers AI (LLM) でゲーム名候補を生成
    const llmResult = await generateGameNameWithLLM(env.AI, inputTrimmed);

    if (!llmResult.gameName) {
      return errorResponse('Could not normalize game name', 400);
    }

    // 3. Vectorize で類似ゲーム検索
    const similarGames = await searchSimilarGames(
      env.AI,
      env.GAME_VECTORIZE,
      llmResult.gameName
    );

    // 最も類似度が高いゲームを選択
    const bestMatch = similarGames[0];
    const normalized = bestMatch ? bestMatch.id : llmResult.gameName;
    const confidence = bestMatch ? bestMatch.score : llmResult.confidence;

    // 4. キャッシュに保存
    await setCachedGameName(env.FRIEND_CODE_DB, inputTrimmed, normalized, confidence);

    return jsonResponse({
      normalized,
      confidence,
      method: 'ai',
      llmSuggestion: llmResult.gameName,
      vectorizeMatches: similarGames.slice(0, 3),
      source: 'Workers AI + Vectorize'
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[normalizeGameName]', error);
    return errorResponse(error.message, 500, corsHeaders);
  }
}
