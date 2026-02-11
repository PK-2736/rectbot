import { jsonResponse } from '../worker/http.js';
import { verifyServiceToken } from '../worker/auth.js';
import { generateGameEmbeddings } from '../utils/gameEmbeddings';

async function handleAdminRoutes(request, env, { url, safeHeaders }) {
  if (url.pathname === '/api/admin/generate-games' && request.method === 'POST') {
    if (!await verifyServiceToken(request, env)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, safeHeaders);
    }

    try {
      const result = await generateGameEmbeddings(env);
      return jsonResponse({ ok: true, ...result }, 200, safeHeaders);
    } catch (error) {
      console.error('[Generate Games Error]', error);
      return jsonResponse({ ok: false, error: error.message }, 500, safeHeaders);
    }
  }

  return null;
}

export { handleAdminRoutes };
