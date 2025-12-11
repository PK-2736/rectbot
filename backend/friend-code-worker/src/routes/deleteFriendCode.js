/**
 * Friend Code 削除エンドポイント
 */

import { deleteFriendCode } from '../db/friendCodes';
import { jsonResponse, errorResponse } from '../utils/response';

export async function handleDeleteFriendCode(request, env) {
  try {
    const body = await request.json();
    const { userId, guildId, gameName } = body;

    if (!userId || !guildId || !gameName) {
      return errorResponse('Missing required fields', 400);
    }

    const success = await deleteFriendCode(env.DB, userId, guildId, gameName);

    if (!success) {
      return errorResponse('Friend code not found', 404);
    }

    return jsonResponse({
      success: true,
      message: 'Friend code deleted successfully'
    });

  } catch (error) {
    console.error('[deleteFriendCode]', error);
    return errorResponse(error.message, 500);
  }
}
