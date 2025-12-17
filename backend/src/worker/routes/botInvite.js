// routes/botInvite.js

export async function routeBotInvite(request, env, ctx, url, corsHeaders) {
  // Create one-time wrapper URL
  if (url.pathname === '/api/bot-invite/one-time' && request.method === 'POST') {
    try {
      if (!env.DISCORD_CLIENT_ID) {
        console.error('[routeBotInvite] DISCORD_CLIENT_ID not configured');
        return new Response(JSON.stringify({ error: 'config_missing', detail: 'DISCORD_CLIENT_ID not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log('[routeBotInvite /api/bot-invite/one-time] Creating token...');
      const id = env.INVITE_TOKENS_DO.idFromName('global');
      const stub = env.INVITE_TOKENS_DO.get(id);
      const createResp = await stub.fetch(new Request(new URL('/do/invite-token', url).toString(), { method: 'POST' }));
      console.log('[routeBotInvite] Durable Object response status:', createResp.status);
      const data = await createResp.json();
      console.log('[routeBotInvite] Token response:', { ok: data?.ok, token: data?.token ? data.token.slice(0, 16) + '...' : undefined });
      if (!data?.ok || !data?.token) {
        console.error('[routeBotInvite] Token creation failed:', data);
        return new Response(JSON.stringify({ error: 'create_failed', detail: data }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const token = data.token;
      const wrapperUrl = new URL(`/api/bot-invite/t/${encodeURIComponent(token)}`, url).toString();
      console.log('[routeBotInvite] Generated wrapper URL:', wrapperUrl.slice(0, 60) + '...');
      return new Response(JSON.stringify({ ok: true, url: wrapperUrl }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[routeBotInvite] Error creating token:', e?.message || e);
      return new Response(JSON.stringify({ error: 'internal_error', detail: e?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
  <title>Recrubo | ボット招待の確認</title>
    <style>
      :root {
        --bg1: #ffe4e6; /* rose-100 */
        --bg2: #ffedd5; /* orange-100 */
        --brand: #f97316; /* orange-500 */
        --accent: #ec4899; /* pink-500 */
        --text: #0f172a; /* slate-900 */
        --muted: #475569; /* slate-600 */
        --card: #ffffff;
        --card-border: #fde68a; /* amber-200 like */
        --btn-shadow: rgba(249, 115, 22, 0.35);
      }
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, 'Hiragino Kaku Gothic ProN', 'Meiryo', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;
        color: var(--text);
        background: linear-gradient(135deg, var(--bg1), var(--bg2));
        background-attachment: fixed;
        display: grid; place-items: center;
      }
      .wrap { padding: 24px; width: 100%; }
      .card {
        margin: 0 auto;
        background: var(--card);
        border: 1px solid var(--card-border);
        border-radius: 16px;
        max-width: 720px;
        padding: 28px 24px;
        box-shadow: 0 12px 40px var(--btn-shadow);
      }
      .brand {
        font-weight: 800;
        font-size: 22px;
        letter-spacing: .4px;
        background: linear-gradient(90deg, var(--brand), var(--accent));
        -webkit-background-clip: text; background-clip: text;
        color: transparent;
        margin: 0 0 4px;
      }
      h1 { margin: 8px 0 12px; font-size: 22px; }
      p { margin: 0; line-height: 1.7; color: var(--muted); }
      .cta { margin-top: 18px; display: flex; gap: 12px; align-items: center; }
      button {
        appearance: none; border: 0; cursor: pointer;
        padding: 12px 18px; border-radius: 12px; font-weight: 700;
        color: #fff; font-size: 15px;
        background: linear-gradient(90deg, var(--brand), var(--accent));
        box-shadow: 0 10px 22px var(--btn-shadow);
        transition: transform .06s ease, filter .15s ease;
      }
      button:hover { filter: brightness(1.05); }
      button:active { transform: translateY(1px); }
      .note { font-size: 12px; color: var(--muted); margin-top: 10px; }
      .footer { margin-top: 16px; font-size: 12px; color: var(--muted); }
      .footer a { color: var(--brand); text-decoration: none; }
      .footer a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card" aria-label="ボット招待の確認">
          <div class="brand">Recrubo</div>
        <h1>ボット招待へ進む前に</h1>
        <p>このリンクは <strong>一回限り</strong> の招待リンクです。<br />
        「続行」を押すとリンクが確定し、Discord のボット招待ページへ移動します。</p>
        <form class="cta" method="POST" action="/api/bot-invite/t/${encodeURIComponent(token)}/go">
          <button type="submit" aria-label="続行してボットを招待">続行してボットを招待</button>
        </form>
        <p class="note">プレビュー（この画面を開くだけ）ではリンクは消費されません。</p>
        <div class="footer">
          <a href="https://recrubo.net" rel="noopener">公式サイトに戻る</a>
        </div>
      </section>
    </main>
  </body>
</html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
  }

  // Confirm (POST) - consume and redirect
  const matchInviteGo = url.pathname.match(/^\/api\/bot-invite\/t\/([A-Za-z0-9_\-]+)\/go$/);
  if (matchInviteGo && request.method === 'POST') {
    try {
      const token = matchInviteGo[1];
      console.log('[routeBotInvite /go] Consuming token:', token.slice(0, 16) + '...');
      const id = env.INVITE_TOKENS_DO.idFromName('global');
      const stub = env.INVITE_TOKENS_DO.get(id);
      const consumeResp = await stub.fetch(new Request(new URL(`/do/invite-token/${encodeURIComponent(token)}/consume`, url).toString(), { method: 'POST' }));
      console.log('[routeBotInvite /go] Consume response status:', consumeResp.status);
      if (consumeResp.status === 404) {
        console.warn('[routeBotInvite /go] Token not found:', token.slice(0, 16) + '...');
        return new Response('この招待リンクは存在しません。', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      if (consumeResp.status === 410) {
        console.warn('[routeBotInvite /go] Token already used:', token.slice(0, 16) + '...');
        return new Response('この招待リンクは使用済みです。', { status: 410, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      if (!consumeResp.ok) {
        console.error('[routeBotInvite /go] Consume failed:', consumeResp.status);
        return new Response('内部エラーが発生しました。', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      const clientId = env.DISCORD_CLIENT_ID;
      const perms = encodeURIComponent(env.BOT_INVITE_PERMISSIONS || '0');
      const scopes = encodeURIComponent('bot applications.commands');
      const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=${scopes}`;
      console.log('[routeBotInvite /go] Redirecting to Discord OAuth:', discordUrl.slice(0, 60) + '...');
      return new Response(null, { status: 302, headers: { Location: discordUrl, ...corsHeaders } });
    } catch (e) {
      console.error('[routeBotInvite /go] Error:', e?.message || e);
      return new Response('内部エラーが発生しました。', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }

  return null;
}
