import { jsonResponse } from '../worker/http.js';

async function listItems(store) {
  if (store && store.forwardToDO) {
    const res = await store.forwardToDO('/api/recruits', 'GET');
    const data = await res.json();
    return data.items || [];
  }
  if (store) return await store.listAll();
  return [];
}

async function handleMetricsRoutes(_request, _env, { url, cors, safeHeaders, store }) {
  if (url.pathname !== '/metrics') return null;

  try {
    const items = await listItems(store);
    const now = Date.now();
    const activeRecruits = items.filter(r => {
      const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : Infinity;
      return exp > now && r.status === 'recruiting';
    });

    const metrics = [
      '# HELP recruits_total Total number of recruitment posts',
      '# TYPE recruits_total gauge',
      `recruits_total ${items.length}`,
      '# HELP recruits_active Active recruitment posts',
      '# TYPE recruits_active gauge',
      `recruits_active ${activeRecruits.length}`,
      '# HELP recruits_participants_total Total participants across all recruits',
      '# TYPE recruits_participants_total gauge',
      `recruits_participants_total ${items.reduce((sum, r) => sum + (r.currentMembers?.length || r.participants?.length || 0), 0)}`
    ].join('\n');

    return new Response(metrics, {
      status: 200,
      headers: { 'content-type': 'text/plain; version=0.0.4', ...(cors || {}) }
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message }, 500, safeHeaders);
  }
}

export { handleMetricsRoutes };
