/**
 * Friend Code 取得エンドポイント
 */

import { getFriendCodes } from '../../db/friendCodes';

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function errorResponse(message, status = 500, headers = {}) {
  return jsonResponse({ success: false, error: message }, status, headers);
}

export async function handleGetFriendCodes(request, env, corsHeaders = {}) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const guildId = url.searchParams.get('guildId');
    const gameName = url.searchParams.get('gameName');

    if (!userId || !guildId) {
      return errorResponse('Missing userId or guildId', 400, corsHeaders);
    }

    const codes = await getFriendCodes(env.FRIEND_CODE_DB, userId, guildId, gameName);

    return jsonResponse({
      success: true,
      codes
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[getFriendCodes]', error);
    return errorResponse(error.message, 500, corsHeaders);
  }
}
