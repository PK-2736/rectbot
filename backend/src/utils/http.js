const JSON_CONTENT_TYPE = { "Content-Type": "application/json" };

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_CONTENT_TYPE, ...headers }
  });
}

export function textResponse(text, status = 200, headers = {}) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers }
  });
}

export function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers }
  });
}

export function notFoundResponse(message = "not_found", status = 404, headers = {}) {
  return jsonResponse({ error: message }, status, headers);
}

export async function safeReadJson(request) {
  try {
    const bodyText = await request.text();
    if (!bodyText) return {};
    return JSON.parse(bodyText);
  } catch (_) {
    return {};
  }
}

export function mergeHeaders(base = {}, overrides = {}) {
  return { ...base, ...overrides };
}

export const JSON_HEADERS = JSON_CONTENT_TYPE;
