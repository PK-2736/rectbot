// Worker unified API - minimal self-contained implementation
// - Uses Durable Object if bound (env.RECRUITS_DO), otherwise in-memory fallback (non-persistent)
// - CORS origins via CORS_ORIGINS env (comma separated)
// - Write ops require Authorization: Bearer <SERVICE_TOKEN>

import { handleFriendCodeRoutes } from './routes/friend-code/index';
import { handleGuildSettingsRoutes } from './routes/guild-settings';
import { handleAdminRoutes } from './routes/admin';
import { handleMetricsRoutes } from './routes/metrics';
import { handleGrafanaRoutes } from './routes/grafana';
import { handleRecruitmentRoutes } from './routes/recruitments';
import { handleBotInviteRoutes } from './routes/bot-invite';
import { corsHeadersFor } from './worker/cors.js';
import { jsonResponse } from './worker/http.js';
import { createStore } from './worker/store.js';

function isFriendCodeRequest(pathname) {
  return pathname.startsWith('/api/game/') || pathname.startsWith('/api/friend-code/');
}

function isBotApiRequest(pathname) {
  return pathname.startsWith('/api/guild-settings/') ||
         pathname.startsWith('/api/recruitments') ||
         pathname.startsWith('/api/recruitment') ||
         pathname.startsWith('/api/bot-invite/');
}

function shouldAllowWithoutCors(request, isFriendCode, isBotApi) {
  return request.method === 'GET' || isFriendCode || isBotApi;
}

function isHealthCheckPath(pathname) {
  return pathname === '/ping' || pathname === '/health';
}

async function handleHealthCheck(safeHeaders) {
  return jsonResponse({ ok: true, name: 'recrubo-api', status: 'ok' }, 200, safeHeaders);
}

async function tryRouteHandlers(handlers) {
  for (const handler of handlers) {
    const response = await handler();
    if (response) return response;
  }
  return null;
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeadersFor(origin, env);

    if (request.method === 'OPTIONS') {
      if (!cors) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    const isFriendCode = isFriendCodeRequest(url.pathname);
    const isBotApi = isBotApiRequest(url.pathname);

    if (!cors && !shouldAllowWithoutCors(request, isFriendCode, isBotApi)) {
      return new Response('Forbidden', { status: 403 });
    }

    const safeHeaders = cors || {};

    if (isHealthCheckPath(url.pathname)) {
      return handleHealthCheck(safeHeaders);
    }

    const store = createStore(env, request);

    const response = await tryRouteHandlers([
      () => handleFriendCodeRoutes(request, env, { url, safeHeaders }),
      () => handleGuildSettingsRoutes(request, env, { url, safeHeaders }),
      () => handleAdminRoutes(request, env, { url, safeHeaders }),
      () => handleMetricsRoutes(request, env, { url, cors, safeHeaders, store }),
      () => handleGrafanaRoutes(request, env, { url, safeHeaders, store }),
      () => handleRecruitmentRoutes(request, env, { url, safeHeaders, store, cors }),
      () => handleBotInviteRoutes(request, env, { url, safeHeaders })
    ]);

    if (response) return response;

    return new Response('Not Found', { status: 404, headers: safeHeaders });
  }
};
