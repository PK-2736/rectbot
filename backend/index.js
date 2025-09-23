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
        
        console.log(`[finalize] Starting finalization for guild: ${guildId}`);
        
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
        
        console.log(`[finalize] Session settings before processing:`, sessionSettings);
        
        // KVセッションの新しい形式の設定値も確認（古い形式を優先してDiscord側と整合性を保つ）
        const finalSettings = {
          recruitmentChannelId: sessionSettings.recruit_channel || sessionSettings.recruitmentChannelId,
          recruitmentNotificationRoleId: sessionSettings.notification_role || sessionSettings.recruitmentNotificationRoleId,
          defaultRecruitTitle: sessionSettings.defaultTitle || sessionSettings.defaultRecruitTitle || "参加者募集",
          defaultRecruitColor: sessionSettings.defaultColor || sessionSettings.defaultRecruitColor || "#00FFFF",
          updateNotificationChannelId: sessionSettings.update_channel || sessionSettings.updateNotificationChannelId
        };
        
        console.log(`[finalize] Final settings to save:`, finalSettings);
        
        // Supabase保存を試行、失敗した場合はKVにフォールバック
        let supabaseSuccess = false;
        
        try {
          // Supabaseに最終保存（UPSERT操作）
          const supabaseData = {
            guild_id: guildId,
            recruit_channel_id: finalSettings.recruitmentChannelId,
            notification_role_id: finalSettings.recruitmentNotificationRoleId,
            default_title: finalSettings.defaultRecruitTitle,
            default_color: finalSettings.defaultRecruitColor,
            update_channel_id: finalSettings.updateNotificationChannelId,
            updated_at: new Date().toISOString()
          };
          
          console.log(`[finalize] Attempting Supabase save:`, supabaseData);
          
          // まず既存レコードがあるか確認
          const existingRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
            method: 'GET',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          
          const existingData = await existingRes.json();
          console.log(`[finalize] Existing guild settings:`, existingData);
          
          let supaRes;
          if (existingData && existingData.length > 0) {
            // 更新操作
            console.log(`[finalize] Updating existing guild settings for ${guildId}`);
            supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
              method: 'PATCH',
              headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                recruit_channel_id: finalSettings.recruitmentChannelId,
                notification_role_id: finalSettings.recruitmentNotificationRoleId,
                default_title: finalSettings.defaultRecruitTitle,
                default_color: finalSettings.defaultRecruitColor,
                update_channel_id: finalSettings.updateNotificationChannelId,
                updated_at: new Date().toISOString()
              })
            });
          } else {
            // 新規作成
            console.log(`[finalize] Creating new guild settings for ${guildId}`);
            supaRes = await fetch(env.SUPABASE_URL + '/rest/v1/guild_settings', {
              method: 'POST',
              headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(supabaseData)
            });
          }
          
          if (!supaRes.ok) {
            const errorText = await supaRes.text();
            console.error(`[finalize] Supabase operation failed:`);
            console.error(`[finalize] Status: ${supaRes.status}`);
            console.error(`[finalize] Status Text: ${supaRes.statusText}`);
            console.error(`[finalize] Response Headers:`, [...supaRes.headers.entries()]);
            console.error(`[finalize] Response Body: ${errorText}`);
            console.error(`[finalize] Request Data:`, supabaseData);
            console.error(`[finalize] Request URL:`, supaRes.url);
            throw new Error(`Supabase save failed: ${supaRes.status} - ${errorText}`);
          }
          
          const savedResult = await supaRes.json();
          console.log(`[finalize] Guild settings saved to Supabase for guild ${guildId}:`, savedResult);
          supabaseSuccess = true;
          
          // KVから古い永続設定を削除（Supabaseがメインになるため）
          try {
            await env.RECRUIT_KV.delete(`guild_settings:${guildId}`);
            console.log(`[finalize] Deleted old KV settings for guild ${guildId}`);
          } catch (deleteError) {
            console.log(`[finalize] Old KV settings delete failed (may not exist): ${deleteError.message}`);
          }
          
        } catch (supabaseError) {
          console.error(`[finalize] Supabase operation failed, falling back to KV:`, supabaseError);
          
          // Supabase失敗時はKVに保存（フォールバック）
          await saveToKV(`guild_settings:${guildId}`, {
            ...finalSettings,
            finalizedAt: new Date().toISOString(),
            fallbackMode: true
          });
          
          console.log(`[finalize] Settings saved to KV as fallback for guild ${guildId}`);
        }
        
        // セッションデータを削除
        try {
          await env.RECRUIT_KV.delete(`guild_session:${guildId}`);
          console.log(`[finalize] Session deleted for guild ${guildId}`);
        } catch (deleteError) {
          console.log(`[finalize] Session delete failed (may not exist): ${deleteError.message}`);
        }
        
        const responseMessage = supabaseSuccess 
          ? "Settings saved to Supabase" 
          : "Settings saved to KV (Supabase unavailable)";
        
        return new Response(JSON.stringify({ 
          ok: true, 
          message: responseMessage,
          supabaseSuccess,
          fallbackMode: !supabaseSuccess
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('[finalize] Guild settings finalize error:', error);
        console.error('[finalize] Error stack:', error.stack);
        return new Response(JSON.stringify({ 
          error: "Internal server error",
          details: error.message,
          timestamp: new Date().toISOString()
        }), { 
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
            
            // 新旧プロパティ名の同期処理
            const syncedSettings = { ...settings };
            
            // 各設定項目について、新旧両方のプロパティを同期
            if (settings.recruit_channel !== undefined) {
              syncedSettings.recruitmentChannelId = settings.recruit_channel;
            }
            if (settings.notification_role !== undefined) {
              syncedSettings.recruitmentNotificationRoleId = settings.notification_role;
            }
            if (settings.defaultTitle !== undefined) {
              syncedSettings.defaultRecruitTitle = settings.defaultTitle;
            }
            if (settings.defaultColor !== undefined) {
              syncedSettings.defaultRecruitColor = settings.defaultColor;
            }
            if (settings.update_channel !== undefined) {
              syncedSettings.updateNotificationChannelId = settings.update_channel;
            }
            
            const updatedSession = { ...existingSession, ...syncedSettings, updatedAt: new Date().toISOString() };
            
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

    // Supabase接続テスト用API
    if (url.pathname === "/api/admin/supabase-test" && request.method === "GET") {
      try {
        console.log(`[supabase-test] Testing Supabase connection...`);
        
        // 1. 基本的な接続テスト
        const testRes = await fetch(env.SUPABASE_URL + '/rest/v1/', {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });
        
        console.log(`[supabase-test] Basic connection: ${testRes.status}`);
        
        // 2. テーブル存在確認とサンプルデータ取得
        let tableExists = false;
        let tableStructure = null;
        let sampleData = null;
        try {
          const tableRes = await fetch(env.SUPABASE_URL + '/rest/v1/guild_settings?limit=1', {
            method: 'GET',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (tableRes.ok) {
            tableExists = true;
            const data = await tableRes.json();
            sampleData = data;
            if (Array.isArray(data) && data.length > 0) {
              tableStructure = `Columns: ${Object.keys(data[0]).join(', ')}`;
            } else {
              tableStructure = "Table exists but no data found";
            }
          } else {
            const errorText = await tableRes.text();
            tableStructure = `Table access failed: ${tableRes.status} - ${errorText}`;
          }
        } catch (tableError) {
          tableStructure = `Table check error: ${tableError.message}`;
        }
        
        // 3. 環境変数確認
        const envCheck = {
          supabaseUrlExists: !!env.SUPABASE_URL,
          supabaseKeyExists: !!env.SUPABASE_SERVICE_ROLE_KEY,
          supabaseUrlFormat: env.SUPABASE_URL ? env.SUPABASE_URL.includes('supabase') : false
        };
        
        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          basicConnection: testRes.ok ? 'Success' : `Failed: ${testRes.status}`,
          tableExists,
          tableStructure,
          sampleData,
          environmentVariables: envCheck,
          recommendation: !tableExists 
            ? "Run the SQL script to create guild_settings table"
            : "Supabase setup appears correct"
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('[supabase-test] Test error:', error);
        return new Response(JSON.stringify({
          error: "Supabase test failed",
          details: error.message,
          timestamp: new Date().toISOString()
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
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
          // Supabaseにデータがない場合、KVフォールバックを試行
          console.log(`[guild-settings] No Supabase data found for guild ${guildId}, checking KV fallback`);
          
          try {
            // まず永続設定を確認
            let kvSettingsRaw = await env.RECRUIT_KV.get(`guild_settings:${guildId}`);
            console.log(`[guild-settings] KV permanent settings raw:`, kvSettingsRaw);
            
            if (!kvSettingsRaw) {
              // 永続設定がない場合はセッション設定を確認
              kvSettingsRaw = await env.RECRUIT_KV.get(`guild_session:${guildId}`);
              console.log(`[guild-settings] KV session settings raw:`, kvSettingsRaw);
            }
            
            if (kvSettingsRaw) {
              const kvSettings = JSON.parse(kvSettingsRaw);
              console.log(`[guild-settings] Found KV fallback settings:`, kvSettings);
              
              // KV形式からフロントエンド形式に変換
              const settings = {
                recruit_channel: kvSettings.recruit_channel || kvSettings.recruitmentChannelId,
                notification_role: kvSettings.notification_role || kvSettings.recruitmentNotificationRoleId,
                defaultTitle: kvSettings.defaultTitle || kvSettings.defaultRecruitTitle || "参加者募集",
                defaultColor: kvSettings.defaultColor || kvSettings.defaultRecruitColor || "#00FFFF",
                update_channel: kvSettings.update_channel || kvSettings.updateNotificationChannelId
              };
              
              console.log(`[guild-settings] Converted KV settings:`, settings);
              
              return new Response(JSON.stringify(settings), { 
                status: 200, 
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            } else {
              console.log(`[guild-settings] No KV data found for guild ${guildId}`);
            }
          } catch (kvError) {
            console.log(`[guild-settings] KV fallback failed:`, kvError);
          }
          
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

    // Supabase直接テスト用API（一時的）
    if (url.pathname === "/api/test/supabase-direct" && request.method === "POST") {
      try {
        const requestBody = await request.text();
        console.log(`[test] Raw request body: ${requestBody}`);
        
        const data = JSON.parse(requestBody);
        const { guildId, recruit_channel_id, notification_role_id } = data;
        
        console.log(`[test] Direct Supabase test - guildId: ${guildId}`);
        
        // まず既存レコードがあるか確認
        const existingRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        const existingData = await existingRes.json();
        console.log(`[test] Existing data:`, existingData);
        
        // テストデータでUPDATE
        const updateData = {
          recruit_channel_id: recruit_channel_id || "test_channel_123",
          notification_role_id: notification_role_id || "test_role_456",
          updated_at: new Date().toISOString()
        };
        
        const supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData)
        });
        
        console.log(`[test] Update response status: ${supaRes.status}`);
        
        if (!supaRes.ok) {
          const errorText = await supaRes.text();
          console.error(`[test] Update failed: ${errorText}`);
          return new Response(JSON.stringify({
            error: "Supabase update failed",
            status: supaRes.status,
            statusText: supaRes.statusText,
            response: errorText,
            requestData: updateData
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        const result = await supaRes.json();
        console.log(`[test] Update success:`, result);
        
        return new Response(JSON.stringify({
          success: true,
          result,
          originalData: existingData
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
        
      } catch (error) {
        console.error('[test] Direct Supabase test error:', error);
        return new Response(JSON.stringify({
          error: "Test failed",
          details: error.message
        }), {
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

    // 手動KV移行API
    if (url.pathname === '/api/manual-kv-migration' && request.method === 'POST') {
      try {
        const { guildId } = await request.json();
        if (!guildId) {
          return new Response(JSON.stringify({ error: "Guild ID required" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // KVセッションデータを取得
        const sessionData = await env.RECRUIT_KV.get(`guild_session:${guildId}`);
        if (!sessionData) {
          return new Response(JSON.stringify({ error: "No session data found" }), { 
            status: 404, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const settings = JSON.parse(sessionData);
        console.log(`[manual-migration] Session data for ${guildId}:`, settings);

        // Supabaseにupsert
        const supabaseData = {
          guild_id: guildId,
          recruit_channel_id: settings.recruit_channel || settings.recruitmentChannelId,
          notification_role_id: settings.notification_role || settings.recruitmentNotificationRoleId,
          default_title: settings.defaultTitle || settings.defaultRecruitTitle || "参加者募集",
          default_color: settings.defaultColor || settings.defaultRecruitColor || "#00FFFF",
          update_channel_id: settings.update_channel || settings.updateNotificationChannelId,
          updated_at: new Date().toISOString()
        };

        // 既存レコードを更新
        const supaRes = await fetch(env.SUPABASE_URL + `/rest/v1/guild_settings?guild_id=eq.${guildId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recruit_channel_id: supabaseData.recruit_channel_id,
            notification_role_id: supabaseData.notification_role_id,
            default_title: supabaseData.default_title,
            default_color: supabaseData.default_color,
            update_channel_id: supabaseData.update_channel_id,
            updated_at: supabaseData.updated_at
          })
        });

        if (!supaRes.ok) {
          const errorText = await supaRes.text();
          console.error(`[manual-migration] Supabase update failed:`, errorText);
          return new Response(JSON.stringify({ 
            error: "Supabase update failed", 
            details: errorText 
          }), { 
            status: 500, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const result = await supaRes.json();
        console.log(`[manual-migration] Successfully updated Supabase:`, result);

        return new Response(JSON.stringify({ 
          ok: true, 
          message: "Manual migration completed",
          supabaseData,
          result
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error('[manual-migration] Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // KVデバッグAPI
    if (url.pathname === '/api/debug-kv' && request.method === 'GET') {
      try {
        const guildId = new URL(request.url).searchParams.get('guildId') || '1414530004657766422';
        
        const sessionKey = `guild_session:${guildId}`;
        const settingsKey = `guild_settings:${guildId}`;
        
        const sessionData = await env.RECRUIT_KV.get(sessionKey);
        const settingsData = await env.RECRUIT_KV.get(settingsKey);
        
        const allKeys = await env.RECRUIT_KV.list();
        const guildKeys = allKeys.keys.filter(k => k.name.includes(guildId));
        
        return new Response(JSON.stringify({
          guildId,
          sessionKey,
          settingsKey,
          sessionData: sessionData ? JSON.parse(sessionData) : null,
          settingsData: settingsData ? JSON.parse(settingsData) : null,
          allGuildKeys: guildKeys,
          timestamp: new Date().toISOString()
        }, null, 2), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
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


