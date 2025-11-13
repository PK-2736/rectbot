import type { APIRoute } from 'astro';

export const prerender = false;

const DEFAULT_API_BASE = (process.env.PRIVATE_API_BASE_URL || process.env.PUBLIC_API_BASE_URL || 'https://api.recrubo.net').trim().replace(/\/$/, '');
const SERVICE_TOKEN = (process.env.PRIVATE_SERVICE_TOKEN || process.env.SERVICE_TOKEN || '').trim();

const TARGET_ENDPOINT = '/api/bot-invite/one-time';

function buildHeaders() {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8'
  };
  if (SERVICE_TOKEN) {
    headers['authorization'] = `Bearer ${SERVICE_TOKEN}`;
    headers['x-service-token'] = SERVICE_TOKEN;
  }
  return headers;
}

function normalizeBaseUrl(base: string) {
  if (!base) return DEFAULT_API_BASE;
  return base.replace(/\/$/, '');
}

async function requestInvite(apiBase: string) {
  const url = `${normalizeBaseUrl(apiBase)}${TARGET_ENDPOINT}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders()
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const error = new Error(`Invite request failed: ${res.status}`);
    (error as any).status = res.status;
    (error as any).body = data || text;
    throw error;
  }
  const inviteUrl = data?.url || data?.inviteUrl || null;
  if (!inviteUrl || typeof inviteUrl !== 'string') {
    const error = new Error('Invite API returned no URL');
    (error as any).status = res.status;
    (error as any).body = data;
    throw error;
  }
  return inviteUrl;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const requestJson = await request.json().catch(() => null);
    const baseOverride = requestJson?.apiBase;
    const inviteUrl = await requestInvite(baseOverride ? String(baseOverride) : DEFAULT_API_BASE);
    return new Response(JSON.stringify({ ok: true, url: inviteUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
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
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
};
