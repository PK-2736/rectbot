/**
 * フレンドコード/ID検証エンドポイント
 * Workers AI を使用してフレンドコードの妥当性を検証
 */

import { jsonResponse } from '../../worker/http.js';

function buildValidationPrompt(gameName, friendCode) {
  return `あなたはゲームのフレンドコード/ID検証の専門家です。

ゲーム名: ${gameName}
入力されたフレンドコード/ID: ${friendCode}

このフレンドコード/IDが「${gameName}」で使用される形式として妥当かどうか判定してください。

一般的な形式の例:
- Valorant: RiotID#TAG (例: Player#1234)
- Apex Legends: Origin ID (英数字)
- Minecraft: Minecraftユーザー名 (英数字_)
- Nintendo Switch: SW-XXXX-XXXX-XXXX
- Steam: Steam ID (数字) または カスタムURL
- Discord: ユーザー名#0000 または 新形式ユーザー名
- PlayStation Network: PSN ID (英数字_-)
- Xbox: Gamertag (英数字)
- Fortnite: Epic Games アカウント名

以下のJSON形式で回答してください:
{
  "isValid": true/false,
  "confidence": 0.0-1.0,
  "message": "判定理由",
  "suggestions": ["修正案1", "修正案2"]
}

明らかに無効な例:
- ランダムな文字列
- 日本語のみ（ゲームによる）
- 極端に短い/長い
- 形式が完全に一致しない（例: ValorantなのにSW-で始まる）
- 絵文字のみ
- 意味不明な文字列

JSON以外は出力しないでください。`;
}

function parseAiResult(response) {
  const content = response.response || response.result?.response || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }
  return JSON.parse(jsonMatch[0]);
}

function fallbackResult(message) {
  return {
    isValid: true,
    confidence: 0.5,
    message,
    suggestions: []
  };
}

function normalizeLowConfidence(result) {
  if (result.confidence < 0.7) {
    return {
      ...result,
      isValid: true,
      message: `⚠️ ${result.message}\n（信頼度が低いため警告のみ）`
    };
  }
  return result;
}

async function readValidationInput(request) {
  try {
    const payload = await request.json();
    const gameName = payload?.gameName;
    const friendCode = payload?.friendCode;
    if (!gameName || !friendCode) {
      return { error: jsonResponse({ error: 'gameName and friendCode are required' }, 400, { 'Content-Type': 'application/json' }) };
    }
    return { gameName, friendCode };
  } catch (_error) {
    return { error: jsonResponse({ error: 'invalid_json' }, 400, { 'Content-Type': 'application/json' }) };
  }
}

async function runAiValidation(env, gameName, friendCode) {
  const prompt = buildValidationPrompt(gameName, friendCode);
  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: 'You are a helpful assistant that validates game friend codes and IDs. Always respond in valid JSON format.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 500
  });

  try {
    const parsed = parseAiResult(response);
    return normalizeLowConfidence(parsed);
  } catch (parseError) {
    console.error('[validateFriendCode] AI response parse error:', parseError);
    console.error('[validateFriendCode] AI raw response:', response);
    return fallbackResult('AI判定に失敗しました。手動で確認してください。');
  }
}

export async function validateFriendCode(request, env) {
  try {
    const { gameName, friendCode, error } = await readValidationInput(request);
    if (error) return error;

    const normalized = await runAiValidation(env, gameName, friendCode);
    return jsonResponse(normalized, 200, { 'Content-Type': 'application/json' });
  } catch (error) {
    console.error('[validateFriendCode] Error:', error);
    return jsonResponse(fallbackResult('エラーが発生しましたが、登録は可能です。'), 200, {
      'Content-Type': 'application/json'
    });
  }
}
