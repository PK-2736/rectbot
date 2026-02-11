function parseOrigins(env) {
  const raw = env.CORS_ORIGINS || 'https://recrubo.net,https://www.recrubo.net,https://dash.recrubo.net,https://grafana.recrubo.net';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeadersFor(origin, env) {
  const allowed = parseOrigins(env);
  // セキュリティ: Access-Control-Allow-Credentials: true と * の併用は禁止
  // 許可されたOriginのみ明示的に返す。不明なOriginは拒否。
  if (!origin || !allowed.includes(origin)) {
    return null;
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-token',
    'Access-Control-Allow-Credentials': 'true'
  };
}

export { parseOrigins, corsHeadersFor };
