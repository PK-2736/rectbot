/**
 * Workers AI (LLM) を使用してゲーム名を推定
 */

export async function generateGameNameWithLLM(ai, userInput) {
  try {
    const prompt = `You are a game name normalizer. Given a user's input (which may be abbreviated, misspelled, or in another language), return the official English game title.

Input: "${userInput}"

Return ONLY a JSON object with this exact structure:
{
  "gameName": "Official Game Name",
  "confidence": 0.95,
  "reasoning": "Brief explanation"
}

Examples:
- "valo" → {"gameName": "Valorant", "confidence": 0.95, "reasoning": "Common abbreviation"}
- "apex" → {"gameName": "Apex Legends", "confidence": 0.98, "reasoning": "Standard short form"}
- "マイクラ" → {"gameName": "Minecraft", "confidence": 0.92, "reasoning": "Japanese nickname"}

Now process the input above.`;

    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 150,
      temperature: 0.3
    });

    // レスポンスをパース
    let result;
    try {
      // レスポンスからJSONを抽出
      const text = response.response || response.text || JSON.stringify(response);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        // フォールバック: 入力をそのまま使用
        result = {
          gameName: capitalizeWords(userInput),
          confidence: 0.5,
          reasoning: 'LLM response parsing failed'
        };
      }
    } catch (parseError) {
      console.error('[LLM Parse Error]', parseError);
      result = {
        gameName: capitalizeWords(userInput),
        confidence: 0.5,
        reasoning: 'JSON parse error'
      };
    }

    return result;

  } catch (error) {
    console.error('[LLM Error]', error);
    // エラー時のフォールバック
    return {
      gameName: capitalizeWords(userInput),
      confidence: 0.3,
      reasoning: 'LLM request failed'
    };
  }
}

/**
 * 文字列を Title Case に変換
 */
function capitalizeWords(str) {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
