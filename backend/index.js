// Discord OAuth用
async function getDiscordToken(code, redirectUri, clientId, clientSecret) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: 'identify email',
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return res.json();
}

async function getDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // OPTIONS リクエスト（プリフライト）の処理
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }
    // KVストアへの保存
    async function saveToKV(key, value) {
      await env.RECRUIT_KV.put(key, JSON.stringify(value));
    }

    // KVストアから取得
    async function getFromKV(key) {
      const val = await env.RECRUIT_KV.get(key);
      return val ? JSON.parse(val) : null;
    }

    // KVストアから全てのキーを取得
    async function listAllKV() {
      // Workers KVのlistは最大1000件まで
      const list = await env.RECRUIT_KV.list();
      return list.keys.map(k => k.name);
    }
    // 募集データ保存API
    if (url.pathname === "/api/recruitment") {
      if (request.method === "POST") {
        // 募集データ保存
        const data = await request.json();
        const key = `${data.guild_id}:${data.channel_id}`;
        await env.RECRUITMENTS.put(key, JSON.stringify(data));
        return new Response(JSON.stringify({ ok: true }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (request.method === "GET") {
        // 募集データ一覧取得
        const list = await env.RECRUITMENTS.list();
        const results = [];
        for (const entry of list.keys) {
          const value = await env.RECRUITMENTS.get(entry.name);
          if (value) results.push(JSON.parse(value));
        }
        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response("Method Not Allowed", { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    // 募集データのステータス更新API（特定のメッセージID）
    if (url.pathname.startsWith("/api/recruitment/") && request.method === "PATCH") {
      const messageId = url.pathname.split("/api/recruitment/")[1];
      if (!messageId) {
        return new Response(JSON.stringify({ error: "Message ID required" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      try {
        const updateData = await request.json();
        const { status, end_time } = updateData;
        
        // すべての募集データから該当するメッセージIDを検索
        const list = await env.RECRUITMENTS.list();
        let updated = false;
        
        for (const entry of list.keys) {
          const value = await env.RECRUITMENTS.get(entry.name);
          if (value) {
            const data = JSON.parse(value);
            if (data.message_id === messageId) {
              // データを更新
              data.status = status;
              if (end_time) data.end_time = end_time;
              
              // KVストアに保存し直す
              await env.RECRUITMENTS.put(entry.name, JSON.stringify(data));
              updated = true;
              break;
            }
          }
        }
        
        if (updated) {
          return new Response(JSON.stringify({ ok: true }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } else {
          return new Response(JSON.stringify({ error: "Recruitment not found" }), { 
            status: 404, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      } catch (error) {
        console.error("Recruitment update error:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    
    // 募集状況保存API
    if (url.pathname === '/api/recruit-status' && request.method === 'POST') {
      const body = await request.json();
      const { serverId, channelId, messageId, startTime } = body;
      if (!serverId || !channelId || !messageId) {
        return new Response(JSON.stringify({ error: 'missing params' }), { status: 400 });
      }
      await saveToKV(`recruit:${serverId}`, { serverId, channelId, messageId, startTime });
      return new Response(JSON.stringify({ result: 'saved' }), { status: 200 });
    }

    // 募集状況削除API
    if (url.pathname === '/api/recruit-status' && request.method === 'DELETE') {
      const serverId = url.searchParams.get('serverId');
      if (!serverId) return new Response(JSON.stringify({ error: 'missing serverId' }), { status: 400 });
      await env.RECRUIT_KV.delete(`recruit:${serverId}`);
      return new Response(JSON.stringify({ result: 'deleted' }), { status: 200 });
    }

    // 現在の募集状況一覧API
    if (url.pathname === '/api/active-recruits' && request.method === 'GET') {
      const keys = await listAllKV();
      const recruitKeys = keys.filter(k => k.startsWith('recruit:'));
      const results = {};
      for (const key of recruitKeys) {
        const data = await getFromKV(key);
        if (data) results[data.serverId] = data;
      }
      return new Response(JSON.stringify(results), { status: 200 });
    }

    // KVテスト用API: /api/kv-test?key=xxx&value=yyy
    if (url.pathname === '/api/kv-test' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      const value = url.searchParams.get('value');
      if (!key) return new Response(JSON.stringify({ error: 'key missing' }), { status: 400 });
      if (value) {
        await saveToKV(key, { value });
        return new Response(JSON.stringify({ result: 'saved', key, value }), { status: 200 });
      } else {
        const data = await getFromKV(key);
        return new Response(JSON.stringify({ result: 'fetched', key, value: data }), { status: 200 });
      }
    }
    // デバッグ用テストエンドポイント
    if (url.pathname === '/api/test' && request.method === 'GET') {
      return new Response(JSON.stringify({ 
        message: 'Backend is working!', 
        timestamp: new Date().toISOString(),
        path: url.pathname,
        method: request.method
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Discord OAuthコールバックAPI (POST)
    if (request.method === 'POST' && url.pathname === '/api/discord/callback') {
      const { code } = await request.json();
      if (!code) return new Response(JSON.stringify({ error: 'code missing' }), { status: 400 });
      // 環境変数からDiscord情報取得
      const clientId = env.REACT_APP_DISCORD_CLIENT_ID;
      const clientSecret = env.DISCORD_CLIENT_SECRET;
      const redirectUri = env.REACT_APP_DISCORD_REDIRECT_URI;
      // Discordトークン取得
      const tokenData = await getDiscordToken(code, redirectUri, clientId, clientSecret);
      if (!tokenData.access_token) {
        return new Response(JSON.stringify({ error: 'discord token error', detail: tokenData }), { status: 400 });
      }
      // Discordユーザー情報取得
      const user = await getDiscordUser(tokenData.access_token);
      // Supabase REST APIでユーザー情報保存
      await fetch(env.SUPABASE_URL + '/rest/v1/users', {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ discord_id: user.id, username: user.username, email: user.email })
      });
      return new Response(JSON.stringify({ user }), { status: 200 });
    }

    // Discord OAuthコールバックAPI (GET) - DiscordからのリダイレクトURL処理
    if (request.method === 'GET' && url.pathname === '/api/discord/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('<!DOCTYPE html><html><body><h1>認証エラー</h1><p>認証コードが見つかりません</p></body></html>', {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      
      try {
        // 環境変数からDiscord情報取得
        const clientId = env.REACT_APP_DISCORD_CLIENT_ID;
        const clientSecret = env.DISCORD_CLIENT_SECRET;
        const redirectUri = env.REACT_APP_DISCORD_REDIRECT_URI;
        
        // Discordトークン取得
        const tokenData = await getDiscordToken(code, redirectUri, clientId, clientSecret);
        if (!tokenData.access_token) {
          return new Response('<!DOCTYPE html><html><body><h1>認証エラー</h1><p>Discordトークンの取得に失敗しました</p></body></html>', {
            status: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
        
        // Discordユーザー情報取得
        const user = await getDiscordUser(tokenData.access_token);
        
        // Supabase REST APIでユーザー情報保存
        await fetch(env.SUPABASE_URL + '/rest/v1/users', {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ discord_id: user.id, username: user.username, email: user.email })
        });
        
        // ダッシュボードにリダイレクト（ユーザー情報をクエリパラメータで渡す）
        const dashboardUrl = new URL('https://dash.rectbot.tech/');
        dashboardUrl.searchParams.set('auth_success', 'true');
        dashboardUrl.searchParams.set('user_id', user.id);
        dashboardUrl.searchParams.set('username', user.username);
        
        return new Response('', {
          status: 302,
          headers: {
            'Location': dashboardUrl.toString(),
            ...corsHeaders
          }
        });
        
      } catch (error) {
        console.error('Discord OAuth error:', error);
        return new Response('<!DOCTYPE html><html><body><h1>認証エラー</h1><p>認証処理中にエラーが発生しました</p></body></html>', {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    }
  // Stripe Webhook部分はWorkers用に要修正（公式SDKは使えません）
  // if (request.method === 'POST' && url.pathname === '/webhook') {
  //   const sig = request.headers.get('stripe-signature');
  //   const body = await request.text();
  //   // ここでbodyとsigを使って署名検証・イベント処理
  //   // Supabase REST APIでサブスク情報保存
  //   return new Response('Webhook received', { status: 200 });
  // }
    // Supabaseからギルド設定を取得するAPI
    if (url.pathname === '/api/guild-config' && request.method === 'GET') {
      const guildId = url.searchParams.get('guild_id');
      if (!guildId) {
        return new Response(JSON.stringify({ error: 'guild_id missing' }), { status: 400 });
      }
      // Supabase REST APIでguildsテーブルから取得
      const supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guilds?guild_id=eq.${guildId}`, {
        method: 'GET',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await supaRes.json();
      if (!Array.isArray(data) || data.length === 0) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(JSON.stringify(data[0]), { status: 200 });
    }
    // 管理者向け: 全ギルドの募集状況・設定をまとめて取得
    if (url.pathname === '/api/admin/guilds' && request.method === 'GET') {
      // Supabaseから全ギルド設定を取得
      const supaRes = await fetch(env.SUPABASE_URL + '/rest/v1/guilds', {
        method: 'GET',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const guilds = await supaRes.json();
      // KVから全recruit情報を取得
      const keys = await env.RECRUIT_KV.list();
      const recruitKeys = keys.keys.filter(k => k.name.startsWith('recruit:')).map(k => k.name);
      const recruits = {};
      for (const key of recruitKeys) {
        const val = await env.RECRUIT_KV.get(key);
        if (val) {
          try {
            const data = JSON.parse(val);
            recruits[data.serverId] = data;
          } catch {}
        }
      }
      // guildsとrecruitsをまとめて返す
      return new Response(JSON.stringify({ guilds, recruits }), { status: 200 });
    }

    // ギルド設定保存API
    // ギルド設定セッション開始API
    if (url.pathname === "/api/guild-settings/start-session" && request.method === "POST") {
      try {
        const { guildId } = await request.json();
        
        if (!guildId) {
          return new Response(JSON.stringify({ error: "Guild ID required" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // Supabaseから既存設定を取得（実装予定）
        // 今はダミーデータを返す
        const defaultSettings = {
          recruitmentChannelId: null,
          recruitmentNotificationRoleId: null,
          defaultRecruitTitle: "参加者募集",
          defaultRecruitColor: "#00FFFF",
          updateNotificationChannelId: null
        };
        
        // KVストアに一時保存
        await saveToKV(`guild_session:${guildId}`, defaultSettings);
        
        return new Response(JSON.stringify({ ok: true, settings: defaultSettings }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('Guild settings session start error:', error);
        return new Response(JSON.stringify({ error: "Internal server error" }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ギルド設定最終保存API
    if (url.pathname === "/api/guild-settings/finalize" && request.method === "POST") {
      try {
        const { guildId } = await request.json();
        
        if (!guildId) {
          return new Response(JSON.stringify({ error: "Guild ID required" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // KVから一時設定を取得
        const sessionSettings = await getFromKV(`guild_session:${guildId}`);
        
        if (!sessionSettings) {
          return new Response(JSON.stringify({ error: "Session not found" }), { 
            status: 404, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // 最終設定をKVに保存（将来的にSupabaseに移行）
        await saveToKV(`guild_settings:${guildId}`, {
          ...sessionSettings,
          finalizedAt: new Date().toISOString()
        });
        
        // セッションデータを削除
        await env.RECRUIT_KV.delete(`guild_session:${guildId}`);
        
        return new Response(JSON.stringify({ ok: true, message: "Settings finalized" }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('Guild settings finalize error:', error);
        return new Response(JSON.stringify({ error: "Internal server error" }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/guild-settings") {
      if (request.method === "POST") {
        try {
          const data = await request.json();
          const { guildId, ...settings } = data;
          
          if (!guildId) {
            return new Response(JSON.stringify({ error: "Guild ID required" }), { 
              status: 400, 
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          
          // 既存の設定を取得
          const existingSettings = await getFromKV(`guild_settings:${guildId}`) || {};
          
          // 新しい設定をマージ
          const updatedSettings = { ...existingSettings, ...settings, updatedAt: new Date().toISOString() };
          
          // KVストアに保存
          await saveToKV(`guild_settings:${guildId}`, updatedSettings);
          
          return new Response(JSON.stringify({ ok: true, settings: updatedSettings }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (error) {
          console.error('Guild settings save error:', error);
          return new Response(JSON.stringify({ error: "Internal server error" }), { 
            status: 500, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      return new Response("Method Not Allowed", { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    // ギルド設定取得API
    if (url.pathname.startsWith("/api/guild-settings/") && request.method === "GET") {
      try {
        const guildId = url.pathname.split("/api/guild-settings/")[1];
        
        if (!guildId) {
          return new Response(JSON.stringify({ error: "Guild ID required" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        const settings = await getFromKV(`guild_settings:${guildId}`);
        
        if (!settings) {
          return new Response(JSON.stringify({ error: "Settings not found" }), { 
            status: 404, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        return new Response(JSON.stringify(settings), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('Guild settings fetch error:', error);
        return new Response(JSON.stringify({ error: "Internal server error" }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ギルド数を取得するエンドポイント
    if (url.pathname === '/api/guild-count' && request.method === 'GET') {
      try {
        // Supabaseから全ギルド数を取得
        const supaRes = await fetch(env.SUPABASE_URL + '/rest/v1/guilds?select=count', {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'count=exact'
          },
        });
        
        if (supaRes.ok) {
          const countHeader = supaRes.headers.get('content-range');
          let count = 0;
          if (countHeader) {
            // content-range: 0-4/5 の形式から総数を抽出
            const match = countHeader.match(/\/(\d+)$/);
            if (match) {
              count = parseInt(match[1]);
            }
          }
          return new Response(JSON.stringify({ count }), { 
            status: 200, 
            headers: corsHeaders 
          });
        } else {
          return new Response(JSON.stringify({ error: 'Failed to fetch guild count', count: 0 }), { 
            status: 500, 
            headers: corsHeaders 
          });
        }
      } catch (error) {
        console.error('Guild count fetch error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error', count: 0 }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // すべてのルートにマッチしなかった場合の404レスポンス
    return new Response("Not Found", { 
      status: 404, 
      headers: corsHeaders 
    });
  }
}


