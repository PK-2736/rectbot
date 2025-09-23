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
        
        // Supabaseから既存設定を取得
        let existingSettings = null;
        try {
          const supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
            method: 'GET',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (supaRes.ok) {
            const data = await supaRes.json();
            if (Array.isArray(data) && data.length > 0) {
              existingSettings = {
                recruitmentChannelId: data[0].recruit_channel_id,
                recruitmentNotificationRoleId: data[0].notification_role_id,
                defaultRecruitTitle: data[0].default_title || "参加者募集",
                defaultRecruitColor: data[0].default_color || "#00FFFF",
                updateNotificationChannelId: data[0].update_channel_id
              };
            }
          }
        } catch (supaError) {
          console.log(`Supabase fetch failed, using defaults: ${supaError.message}`);
        }
        
        // 既存設定がない場合はデフォルト値を使用
        const sessionSettings = existingSettings || {
          recruitmentChannelId: null,
          recruitmentNotificationRoleId: null,
          defaultRecruitTitle: "参加者募集",
          defaultRecruitColor: "#00FFFF",
          updateNotificationChannelId: null
        };
        
        // KVストアに一時保存（セッション用）
        await saveToKV(`guild_session:${guildId}`, sessionSettings);
        
        return new Response(JSON.stringify({ ok: true, settings: sessionSettings }), { 
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
        let sessionSettings = await getFromKV(`guild_session:${guildId}`);
        
        // セッションが存在しない場合は、既存の設定を取得するかデフォルト値を使用
        if (!sessionSettings) {
          console.log(`Session not found for guild ${guildId}, using existing settings or defaults`);
          
          // 既存の設定を確認
          const existingSettings = await getFromKV(`guild_settings:${guildId}`);
          
          sessionSettings = existingSettings || {
            recruitmentChannelId: null,
            recruitmentNotificationRoleId: null,
            defaultRecruitTitle: "参加者募集",
            defaultRecruitColor: "#00FFFF",
            updateNotificationChannelId: null
          };
        }
        
        // Supabaseに最終保存（UPSERT操作）
        const supabaseData = {
          guild_id: guildId,
          recruit_channel_id: sessionSettings.recruitmentChannelId,
          notification_role_id: sessionSettings.recruitmentNotificationRoleId,
          default_title: sessionSettings.defaultRecruitTitle,
          default_color: sessionSettings.defaultRecruitColor,
          update_channel_id: sessionSettings.updateNotificationChannelId,
          updated_at: new Date().toISOString()
        };
        
        // Supabaseにupsert（存在しない場合は作成、存在する場合は更新）
        const supaRes = await fetch(env.SUPABASE_URL + '/rest/v1/guild_settings', {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(supabaseData)
        });
        
        if (!supaRes.ok) {
          const errorText = await supaRes.text();
          console.error(`Supabase save failed: ${supaRes.status} - ${errorText}`);
          throw new Error(`Supabase save failed: ${supaRes.status}`);
        }
        
        console.log(`Guild settings saved to Supabase for guild ${guildId}`);
        
        // KVから古い永続設定を削除（Supabaseがメインになるため）
        try {
          await env.RECRUIT_KV.delete(`guild_settings:${guildId}`);
        } catch (deleteError) {
          console.log(`Old KV settings delete failed (may not exist): ${deleteError.message}`);
        }
        
        // セッションデータを削除
        try {
          await env.RECRUIT_KV.delete(`guild_session:${guildId}`);
        } catch (deleteError) {
          console.log(`Session delete failed (may not exist): ${deleteError.message}`);
        }
        
        return new Response(JSON.stringify({ ok: true, message: "Settings saved to Supabase" }), { 
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
          
          // セッション中の設定はKVに一時保存
          if (guildId.startsWith('guild_session:')) {
            // セッション設定の更新
            const sessionGuildId = guildId.replace('guild_session:', '');
            const existingSession = await getFromKV(`guild_session:${sessionGuildId}`) || {};
            const updatedSession = { ...existingSession, ...settings, updatedAt: new Date().toISOString() };
            
            await saveToKV(`guild_session:${sessionGuildId}`, updatedSession);
            
            return new Response(JSON.stringify({ ok: true, settings: updatedSession }), { 
              status: 200, 
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          } else {
            // 通常の設定更新（セッション中の一時保存）
            const existingSession = await getFromKV(`guild_session:${guildId}`) || {};
            const updatedSession = { ...existingSession, ...settings, updatedAt: new Date().toISOString() };
            
            // セッション中はKVに一時保存
            await saveToKV(`guild_session:${guildId}`, updatedSession);
            
            return new Response(JSON.stringify({ ok: true, settings: updatedSession }), { 
              status: 200, 
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
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

    // データ状況確認用API
    if (url.pathname === "/api/admin/data-status" && request.method === "GET") {
      try {
        // KVから全ギルド設定を取得
        const kvList = await env.RECRUIT_KV.list({ prefix: 'guild_settings:' });
        const kvCount = kvList.keys.length;
        
        // Supabaseから全ギルド設定を取得
        const supaRes = await fetch(env.SUPABASE_URL + '/rest/v1/guild_settings?select=count', {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'count=exact'
          },
        });
        
        let supabaseCount = 0;
        if (supaRes.ok) {
          const countHeader = supaRes.headers.get('content-range');
          if (countHeader) {
            const match = countHeader.match(/\/(\d+)$/);
            if (match) {
              supabaseCount = parseInt(match[1], 10);
            }
          }
        }
        
        return new Response(JSON.stringify({ 
          kv_guild_settings_count: kvCount,
          supabase_guild_settings_count: supabaseCount,
          data_migration_needed: kvCount > supabaseCount
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('Data status check error:', error);
        return new Response(JSON.stringify({ error: "Status check failed" }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // データマイグレーション用API（KV → Supabase）
    if (url.pathname === "/api/admin/migrate-guild-settings" && request.method === "POST") {
      try {
        // KVから全ギルド設定を取得
        const list = await env.RECRUIT_KV.list({ prefix: 'guild_settings:' });
        const migrationResults = [];
        
        for (const entry of list.keys) {
          try {
            const kvData = await env.RECRUIT_KV.get(entry.name);
            if (kvData) {
              const settings = JSON.parse(kvData);
              const guildId = entry.name.replace('guild_settings:', '');
              
              // Supabase形式に変換
              const supabaseData = {
                guild_id: guildId,
                recruit_channel_id: settings.recruit_channel || settings.recruitmentChannelId,
                notification_role_id: settings.notification_role || settings.recruitmentNotificationRoleId,
                default_title: settings.defaultTitle || settings.defaultRecruitTitle || "参加者募集",
                default_color: settings.defaultColor || settings.defaultRecruitColor || "#00FFFF",
                update_channel_id: settings.update_channel || settings.updateNotificationChannelId
              };
              
              // Supabaseにupsert
              const supaRes = await fetch(env.SUPABASE_URL + '/rest/v1/guild_settings', {
                method: 'POST',
                headers: {
                  'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(supabaseData)
              });
              
              if (supaRes.ok) {
                migrationResults.push({ guildId, status: 'success' });
                console.log(`Migrated guild settings for ${guildId}`);
              } else {
                migrationResults.push({ guildId, status: 'failed', error: supaRes.status });
                console.error(`Failed to migrate guild ${guildId}: ${supaRes.status}`);
              }
            }
          } catch (entryError) {
            console.error(`Error processing entry ${entry.name}:`, entryError);
            migrationResults.push({ guildId: entry.name, status: 'error', error: entryError.message });
          }
        }
        
        return new Response(JSON.stringify({ 
          ok: true, 
          message: `Migration completed. Processed ${migrationResults.length} guilds.`,
          results: migrationResults 
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('Migration error:', error);
        return new Response(JSON.stringify({ error: "Migration failed" }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ギルド設定取得API（Supabaseメイン）
    if (url.pathname.startsWith("/api/guild-settings/") && request.method === "GET") {
      try {
        const guildId = url.pathname.split("/api/guild-settings/")[1];
        
        if (!guildId) {
          return new Response(JSON.stringify({ error: "Guild ID required" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // Supabaseから設定を取得
        const supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!supaRes.ok) {
          throw new Error(`Supabase fetch failed: ${supaRes.status}`);
        }
        
        const data = await supaRes.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          // 設定が見つからない場合はデフォルト値を返す
          const defaultSettings = {
            recruit_channel: null,
            notification_role: null,
            defaultTitle: "参加者募集",
            defaultColor: "#00FFFF",
            update_channel: null
          };
          
          return new Response(JSON.stringify(defaultSettings), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // Supabaseのデータ形式をフロントエンド形式に変換
        const settings = {
          recruit_channel: data[0].recruit_channel_id,
          notification_role: data[0].notification_role_id,
          defaultTitle: data[0].default_title || "参加者募集",
          defaultColor: data[0].default_color || "#00FFFF",
          update_channel: data[0].update_channel_id
        };
        
        return new Response(JSON.stringify(settings), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('Guild settings fetch error:', error);
        
        // エラー時はデフォルト値を返す
        const defaultSettings = {
          recruit_channel: null,
          notification_role: null,
          defaultTitle: "参加者募集", 
          defaultColor: "#00FFFF",
          update_channel: null
        };
        
        return new Response(JSON.stringify(defaultSettings), { 
          status: 200, 
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


