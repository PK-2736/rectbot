/**
 * フレンドコード/ID検証エンドポイント
 * Workers AI を使用してフレンドコードの妥当性を検証
 */

export async function validateFriendCode(request, env) {
  try {
    const { gameName, friendCode } = await request.json();

    if (!gameName || !friendCode) {
      return new Response(JSON.stringify({
        error: 'gameName and friendCode are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Workers AI でフレンドコードを検証
    const prompt = `あなたはゲームのフレンドコード/ID検証の専門家です。

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

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a helpful assistant that validates game friend codes and IDs. Always respond in valid JSON format.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    let result;
    try {
      // レスポンスをパース
      const content = response.response || response.result?.response || '';
      
      // JSONブロックを抽出（```json ... ```の場合に対応）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[validateFriendCode] AI response parse error:', parseError);
      console.error('[validateFriendCode] AI raw response:', response);
      
      // パース失敗時はデフォルトで許可（保守的な動作）
      result = {
        isValid: true,
        confidence: 0.5,
        message: 'AI判定に失敗しました。手動で確認してください。',
        suggestions: []
      };
    }

    // 信頼度が低い場合は警告のみ（完全にブロックしない）
    if (result.confidence < 0.7) {
      result.isValid = true; // 低信頼度でも一応許可
      result.message = `⚠️ ${result.message}\n（信頼度が低いため警告のみ）`;
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[validateFriendCode] Error:', error);
    
    // エラー時は許可（保守的な動作）
    return new Response(JSON.stringify({
      isValid: true,
      confidence: 0.5,
      message: 'エラーが発生しましたが、登録は可能です。',
      suggestions: []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
