/**
 * Friend Code 削除エンドポイント
 */

import { deleteFriendCode } from '../../db/friendCodes';

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function errorResponse(message, status = 500, headers = {}) {
  return jsonResponse({ success: false, error: message }, status, headers);
}

export async function handleDeleteFriendCode(request, env, corsHeaders = {}) {
  try {
    const body = await request.json();
    const { userId, guildId, gameName } = body;

    if (!userId || !guildId || !gameName) {
      return errorResponse('Missing required fields', 400, corsHeaders);
    }

    const success = await deleteFriendCode(env.FRIEND_CODE_DB, userId, guildId, gameName);

    if (!success) {
      return errorResponse('Friend code not found', 404, corsHeaders);
    }

    return jsonResponse({
      success: true,
      message: 'Friend code deleted successfully'
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[deleteFriendCode]', error);
    return errorResponse(error.message, 500, corsHeaders);
  }
}
