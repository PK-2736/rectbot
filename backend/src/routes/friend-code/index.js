import { handleNormalizeGameName } from './normalizeGameName';
import { handleAddFriendCode } from './addFriendCode';
import { handleGetFriendCodes } from './getFriendCodes';
import { handleDeleteFriendCode } from './deleteFriendCode';
import { handleSearchGameNames } from './searchGameNames';
import { validateFriendCode } from './validateFriendCode';

const FRIEND_CODE_ROUTES = [
  { path: '/api/game/normalize', method: 'POST', handler: handleNormalizeGameName },
  { path: '/api/friend-code/add', method: 'POST', handler: handleAddFriendCode },
  { path: '/api/friend-code/get', method: 'GET', handler: handleGetFriendCodes },
  { path: '/api/friend-code/delete', method: 'DELETE', handler: handleDeleteFriendCode },
  { path: '/api/game/search', method: 'GET', handler: handleSearchGameNames },
  { path: '/api/friend-code/validate', method: 'POST', handler: validateFriendCode }
];

function findMatchingRoute(pathname, method) {
  return FRIEND_CODE_ROUTES.find(route => 
    route.path === pathname && route.method === method
  );
}

async function handleFriendCodeRoutes(request, env, { url, safeHeaders }) {
  const route = findMatchingRoute(url.pathname, request.method);
  
  if (route) {
    return await route.handler(request, env, safeHeaders);
  }
  
  return null;
}

export { handleFriendCodeRoutes };
