// routes/botInvite.js

export async function routeBotInvite(request, env, ctx, url, corsHeaders) {
  // Create one-time wrapper URL
  if (url.pathname === '/api/bot-invite/one-time' && request.method === 'POST') {
    try {
      if (!env.DISCORD_CLIENT_ID) {
        return new Response(JSON.stringify({ error: 'config_missing', detail: 'DISCORD_CLIENT_ID not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const id = env.INVITE_TOKENS_DO.idFromName('global');
      const stub = env.INVITE_TOKENS_DO.get(id);
      const createResp = await stub.fetch(new Request(new URL('/do/invite-token', url).toString(), { method: 'POST' }));
      const data = await createResp.json();
      if (!data?.ok) {
        return new Response(JSON.stringify({ error: 'create_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const token = data.token;
      const wrapperUrl = new URL(`/api/bot-invite/t/${encodeURIComponent(token)}`, url).toString();
      return new Response(JSON.stringify({ ok: true, url: wrapperUrl }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Landing page (GET) - does NOT consume token
  const matchInvite = url.pathname.match(/^\/api\/bot-invite\/t\/([A-Za-z0-9_\-]+)$/);
  if (matchInvite && request.method === 'GET') {
    const token = matchInvite[1];
    const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex,nofollow" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ボット招待リンクの確認</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0b1220; color: #e5e7eb; display: grid; place-items: center; height: 100vh; margin: 0; }
      .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; max-width: 560px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
      h1 { font-size: 20px; margin: 0 0 12px; }
      p { line-height: 1.6; color: #cbd5e1; }
      form { margin-top: 18px; }
      button { background: #16a34a; color: white; border: 0; border-radius: 8px; padding: 12px 16px; font-weight: 600; cursor: pointer; }
      button:hover { background: #15803d; }
      .note { font-size: 12px; color: #94a3b8; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>ボット招待へ進む前に</h1>
      <p>このリンクは一回限りの招待リンクです。<br />
      続行を押すと初回アクセスとしてリンクが確定し、Discord のボット招待ページへ移動します。</p>
      <form method="POST" action="/api/bot-invite/t/${encodeURIComponent(token)}/go">
        <button type="submit">続行してボットを招待</button>
      </form>
      <p class="note">このページをプレビューするだけではリンクは消費されません。</p>
    </div>
  </body>
 </html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
  }

  // Confirm (POST) - consume and redirect
  const matchInviteGo = url.pathname.match(/^\/api\/bot-invite\/t\/([A-Za-z0-9_\-]+)\/go$/);
  if (matchInviteGo && request.method === 'POST') {
    try {
      const token = matchInviteGo[1];
      const id = env.INVITE_TOKENS_DO.idFromName('global');
      const stub = env.INVITE_TOKENS_DO.get(id);
      const consumeResp = await stub.fetch(new Request(new URL(`/do/invite-token/${encodeURIComponent(token)}/consume`, url).toString(), { method: 'POST' }));
      if (consumeResp.status === 404) return new Response('この招待リンクは存在しません。', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
      if (consumeResp.status === 410) return new Response('この招待リンクは使用済みです。', { status: 410, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
      if (!consumeResp.ok) return new Response('内部エラーが発生しました。', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
      const clientId = env.DISCORD_CLIENT_ID;
      const perms = encodeURIComponent(env.BOT_INVITE_PERMISSIONS || '0');
      const scopes = encodeURIComponent('bot applications.commands');
      const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=${scopes}`;
      return new Response(null, { status: 302, headers: { Location: discordUrl, ...corsHeaders } });
    } catch (e) {
      return new Response('内部エラーが発生しました。', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }

  return null;
}
