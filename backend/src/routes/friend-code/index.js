import { handleNormalizeGameName } from './normalizeGameName';
import { handleAddFriendCode } from './addFriendCode';
import { handleGetFriendCodes } from './getFriendCodes';
import { handleDeleteFriendCode } from './deleteFriendCode';
import { handleSearchGameNames } from './searchGameNames';
import { validateFriendCode } from './validateFriendCode';

async function handleFriendCodeRoutes(request, env, { url, safeHeaders }) {
  if (url.pathname === '/api/game/normalize' && request.method === 'POST') {
    return await handleNormalizeGameName(request, env, safeHeaders);
  }

  if (url.pathname === '/api/friend-code/add' && request.method === 'POST') {
    return await handleAddFriendCode(request, env, safeHeaders);
  }

  if (url.pathname === '/api/friend-code/get' && request.method === 'GET') {
    return await handleGetFriendCodes(request, env, safeHeaders);
  }

  if (url.pathname === '/api/friend-code/delete' && request.method === 'DELETE') {
    return await handleDeleteFriendCode(request, env, safeHeaders);
  }

  if (url.pathname === '/api/game/search' && request.method === 'GET') {
    return await handleSearchGameNames(request, env, safeHeaders);
  }

  if (url.pathname === '/api/friend-code/validate' && request.method === 'POST') {
    return await validateFriendCode(request, env, safeHeaders);
  }

  return null;
}

export { handleFriendCodeRoutes };
