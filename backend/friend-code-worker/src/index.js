/**
 * Cloudflare Worker - Friend Code Management API
 * Workers AI + Vectorize + D1 統合
 */

import { handleNormalizeGameName } from './routes/normalizeGameName';
import { handleAddFriendCode } from './routes/addFriendCode';
import { handleGetFriendCodes } from './routes/getFriendCodes';
import { handleDeleteFriendCode } from './routes/deleteFriendCode';
import { handleSearchGameNames } from './routes/searchGameNames';
import { corsHeaders, errorResponse } from './utils/response';

export default {
  async fetch(request, env, ctx) {
    // CORS プリフライト
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ルーティング
      if (path === '/api/game/normalize' && request.method === 'POST') {
        return await handleNormalizeGameName(request, env);
      }

      if (path === '/api/friend-code/add' && request.method === 'POST') {
        return await handleAddFriendCode(request, env);
      }

      if (path === '/api/friend-code/get' && request.method === 'GET') {
        return await handleGetFriendCodes(request, env);
      }

      if (path === '/api/friend-code/delete' && request.method === 'DELETE') {
        return await handleDeleteFriendCode(request, env);
      }

      if (path === '/api/game/search' && request.method === 'GET') {
        return await handleSearchGameNames(request, env);
      }

      if (path === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return errorResponse('Not Found', 404);

    } catch (error) {
      console.error('[Worker Error]', error);
      return errorResponse(error.message || 'Internal Server Error', 500);
    }
  }
};
