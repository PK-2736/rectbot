/**
 * Friend Code 取得エンドポイント
 */

import { getFriendCodes } from '../db/friendCodes';
import { jsonResponse, errorResponse } from '../utils/response';

export async function handleGetFriendCodes(request, env) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const guildId = url.searchParams.get('guildId');
    const gameName = url.searchParams.get('gameName');

    if (!userId || !guildId) {
      return errorResponse('Missing userId or guildId', 400);
    }

    const codes = await getFriendCodes(env.DB, userId, guildId, gameName);

    return jsonResponse({
      success: true,
      codes
    });

  } catch (error) {
    console.error('[getFriendCodes]', error);
    return errorResponse(error.message, 500);
  }
}
