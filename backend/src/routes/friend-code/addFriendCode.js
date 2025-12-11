/**
 * Friend Code 追加エンドポイント
 */

import { addFriendCode } from '../../db/friendCodes';

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function errorResponse(message, status = 500, headers = {}) {
  return jsonResponse({ success: false, error: message }, status, headers);
}

export async function handleAddFriendCode(request, env, corsHeaders = {}) {
  try {
    const body = await request.json();
    const { userId, guildId, gameName, friendCode } = body;

    if (!userId || !guildId || !gameName || !friendCode) {
      return errorResponse('Missing required fields', 400, corsHeaders);
    }

    await addFriendCode(env.FRIEND_CODE_DB, userId, guildId, gameName, friendCode);

    return jsonResponse({
      success: true,
      message: 'Friend code added successfully'
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[addFriendCode]', error);
    return errorResponse(error.message, 500, corsHeaders);
  }
}
