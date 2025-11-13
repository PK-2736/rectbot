import type { APIRoute } from 'astro';

const DEFAULT_API_BASE = (process.env.PRIVATE_API_BASE_URL || process.env.PUBLIC_API_BASE_URL || 'https://api.recrubo.net').trim().replace(/\/$/, '');
const TARGET_ENDPOINT = '/api/bot-invite/one-time';

function normalizeBaseUrl(base: string) {
  if (!base) return DEFAULT_API_BASE;
  return base.replace(/\/$/, '');
}

async function createOneTimeUrl(apiBase: string) {
  const url = `${normalizeBaseUrl(apiBase)}${TARGET_ENDPOINT}`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' } });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err: any = new Error(`Invite request failed: ${res.status}`);
    err.status = res.status;
    err.body = data || text;
    throw err;
  }
  const inviteUrl = data?.url || data?.inviteUrl || null;
  if (!inviteUrl || typeof inviteUrl !== 'string') {
    const err: any = new Error('Invite API returned no URL');
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return inviteUrl;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const apiBaseOverride = url.searchParams.get('apiBase') || undefined;
    const inviteUrl = await createOneTimeUrl(apiBaseOverride || DEFAULT_API_BASE);
    return new Response(null, { status: 302, headers: { Location: inviteUrl } });
  } catch (error) {
    const status = (error as any)?.status && Number.isInteger((error as any).status)
      ? Number((error as any).status)
      : 500;
    const body = {
      ok: false,
      error: 'invite_generation_failed',
      message: (error as Error).message,
      details: (error as any)?.body ?? null
    };
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
};
