/**
 * Vectorize を使用してゲーム名の類似検索
 */

/**
 * テキストをベクトル化
 */
export async function generateEmbedding(ai, text) {
  try {
    const response = await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    });

    // response.data が配列の配列形式
    if (response.data && response.data[0]) {
      return response.data[0];
    }

    throw new Error('Invalid embedding response');
  } catch (error) {
    console.error('[Embedding Error]', error);
    throw error;
  }
}

/**
 * Vectorize で類似ゲームを検索
 */
export async function searchSimilarGames(ai, vectorize, gameName, topK = 5) {
  try {
    // 1. ゲーム名をベクトル化
    const embedding = await generateEmbedding(ai, gameName);

    // 2. Vectorize で検索
    const results = await vectorize.query(embedding, {
      topK,
      returnMetadata: true
    });

    // 3. 結果を整形
    const matches = results.matches.map(match => ({
      id: match.id,
      score: match.score,
      gameName: match.metadata?.gameName || match.id,
      aliases: match.metadata?.aliases || []
    }));

    return matches;

  } catch (error) {
    console.error('[Vectorize Search Error]', error);
    return [];
  }
}

/**
 * Vectorize にゲーム名を登録
 */
export async function indexGameName(ai, vectorize, gameName, aliases = []) {
  try {
    const embedding = await generateEmbedding(ai, gameName);

    await vectorize.upsert([
      {
        id: gameName.toLowerCase().replace(/\s+/g, '-'),
        values: embedding,
        metadata: {
          gameName,
          aliases,
          indexed_at: new Date().toISOString()
        }
      }
    ]);

    console.log(`[Vectorize] Indexed: ${gameName}`);
    return true;

  } catch (error) {
    console.error('[Vectorize Index Error]', error);
    return false;
  }
}
