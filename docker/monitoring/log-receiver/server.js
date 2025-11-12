const http = require('http');

const PORT = process.env.PORT || 8080;

function toEntries(payload) {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (payload.logs && Array.isArray(payload.logs)) return payload.logs;
  return [payload];
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('log-receiver ok');
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/logs') {
    res.statusCode = 404;
    res.end('not found');
    return;
  }

  // Check Authorization header
  let authHeader = req.headers['authorization'];
  if (!authHeader) {
    // Check query parameter for Authorization
    const headerAuth = url.searchParams.get('header_Authorization');
    if (headerAuth) {
      authHeader = headerAuth;
    }
  }
  const expectedToken = process.env.LOG_RECEIVER_TOKEN;
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== expectedToken) {
    res.statusCode = 401;
    res.end('unauthorized');
    return;
  }

  let buf = [];
  req.on('data', (chunk) => buf.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(buf).toString('utf8');
    let payload;
    try { payload = JSON.parse(raw); } catch { payload = raw; }

    const entries = toEntries(payload);
    const nowIso = new Date().toISOString();

    let count = 0;
    for (const item of entries) {
      let obj;
      if (typeof item === 'string') obj = { message: item };
      else if (item && typeof item === 'object') obj = item;
      else obj = { message: String(item) };

      if (!obj.timestamp) obj.timestamp = nowIso;
      obj.source = obj.source || 'cloudflare-worker';
      // Print as one-line JSON for Promtail docker_sd to pick up
      try {
        console.log(JSON.stringify(obj));
        count++;
      } catch (e) {
        console.log(String(obj.message || obj));
        count++;
      }
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, received: count }));
  });
});

server.listen(PORT, () => {
  console.log(`log-receiver listening on :${PORT}`);
});
