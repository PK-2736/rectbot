/**
 * Friend Code 追加エンドポイント
 */

import { addFriendCode } from '../db/friendCodes';
import { jsonResponse, errorResponse } from '../utils/response';

export async function handleAddFriendCode(request, env) {
  try {
    const body = await request.json();
    const { userId, guildId, gameName, friendCode } = body;

    if (!userId || !guildId || !gameName || !friendCode) {
      return errorResponse('Missing required fields', 400);
    }

    await addFriendCode(env.DB, userId, guildId, gameName, friendCode);

    return jsonResponse({
      success: true,
      message: 'Friend code added successfully'
    });

  } catch (error) {
    console.error('[addFriendCode]', error);
    return errorResponse(error.message, 500);
  }
}
