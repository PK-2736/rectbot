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

    const isFriendCodeAPI = url.pathname.startsWith('/api/game/') || url.pathname.startsWith('/api/friend-code/');
    const isBotAPI = url.pathname.startsWith('/api/guild-settings/') ||
                     url.pathname.startsWith('/api/recruitments') ||
                     url.pathname.startsWith('/api/recruitment') ||
                     url.pathname.startsWith('/api/bot-invite/');

    if (!cors && request.method !== 'GET' && !isFriendCodeAPI && !isBotAPI) {
      return new Response('Forbidden', { status: 403 });
    }

    const safeHeaders = cors || {};

    if (url.pathname === '/ping' || url.pathname === '/health') {
      return jsonResponse({ ok: true, name: 'recrubo-api', status: 'ok' }, 200, safeHeaders);
    }

    const friendCodeResponse = await handleFriendCodeRoutes(request, env, { url, safeHeaders });
    if (friendCodeResponse) return friendCodeResponse;

    const guildSettingsResponse = await handleGuildSettingsRoutes(request, env, { url, safeHeaders });
    if (guildSettingsResponse) return guildSettingsResponse;

    const adminResponse = await handleAdminRoutes(request, env, { url, safeHeaders });
    if (adminResponse) return adminResponse;

    const store = createStore(env, request);

    const metricsResponse = await handleMetricsRoutes(request, env, { url, cors, safeHeaders, store });
    if (metricsResponse) return metricsResponse;

    const grafanaResponse = await handleGrafanaRoutes(request, env, { url, safeHeaders, store });
    if (grafanaResponse) return grafanaResponse;

    const recruitmentResponse = await handleRecruitmentRoutes(request, env, { url, safeHeaders, store, cors });
    if (recruitmentResponse) return recruitmentResponse;

    const botInviteResponse = await handleBotInviteRoutes(request, env, { url, safeHeaders });
    if (botInviteResponse) return botInviteResponse;

    return new Response('Not Found', { status: 404, headers: safeHeaders });
  }
};
