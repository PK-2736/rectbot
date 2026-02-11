/**
 * Friend Code 削除エンドポイント
 */

import { deleteFriendCode } from '../../db/friendCodes';
import { jsonResponse } from '../../worker/http.js';

function errorResponse(message, status = 500, headers = {}) {
  return jsonResponse({ success: false, error: message }, status, headers);
}

function getMissingFields(payload, requiredFields) {
  const missing = [];
  for (const field of requiredFields) {
    if (!payload?.[field]) missing.push(field);
  }
  return missing;
}

function validateRequiredFields(payload, requiredFields, corsHeaders) {
  const missing = getMissingFields(payload, requiredFields);
  if (missing.length === 0) return null;
  return errorResponse(`Missing required fields: ${missing.join(', ')}`, 400, corsHeaders);
}

export async function handleDeleteFriendCode(request, env, corsHeaders = {}) {
  try {
    const body = await request.json();
    const { userId, guildId, gameName } = body;
    const validation = validateRequiredFields(body, ['userId', 'guildId', 'gameName'], corsHeaders);
    if (validation) return validation;

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
