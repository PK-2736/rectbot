# 🚨 VPS Express 接続エラー対処ガイド

## 現在のエラー

```json
{
  "error": "Internal server error",
  "message": "Unexpected token 'e', \"error code: 1102\" is not valid JSON"
}
```

このエラーは **VPS Express サーバーへの接続失敗** を示しています。

---

## 問題の原因

VPS Express サーバーが Cloudflare Tunnel 経由で正しく応答していません。

考えられる原因:
1. VPS Express サーバーが停止している
2. Cloudflare Tunnel (cloudflared) が停止している  
3. Tunnel URL が間違っている
4. SERVICE_TOKEN が設定されていない

---

## 解決方法

### Step 1: VPS サーバーの状態を確認

VPS サーバーにSSHでログインして以下を確認:

```bash
# Express サーバーが動作しているか確認
pm2 list
# または
ps aux | grep node

# Cloudflare Tunnel が動作しているか確認
ps aux | grep cloudflared

# ログを確認
pm2 logs
# または
journalctl -u cloudflared -n 50
```

### Step 2: サービスを再起動

#### Express サーバーを再起動:
```bash
cd /path/to/express/app
pm2 restart all
# または
pm2 restart server
```

#### Cloudflare Tunnel を再起動:
```bash
sudo systemctl restart cloudflared
# または
cloudflared tunnel run
```

### Step 3: Tunnel URL を確認

現在使用している Tunnel URL:
```
https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
```

Cloudflare Dashboard で確認:
1. https://dash.cloudflare.com にログイン
2. "Zero Trust" → "Networks" → "Tunnels"
3. Tunnel の状態が "Healthy" (緑) になっているか確認
4. Public hostname が正しく設定されているか確認

---

## 暫定対応: テストデータを返す

VPS Express サーバーの問題が解決するまで、Worker で直接テストデータを返すことができます。

### Worker に暫定コードを追加

`backend/index.js` の `/api/recruitment/list` エンドポイントを修正:

```javascript
// 管理者用 API：Discord OAuth 認証が必要（JWT ベース）
if (url.pathname === '/api/recruitment/list') {
  console.log('Admin API: /api/recruitment/list accessed');
  
  const cookieHeader = request.headers.get('Cookie');
  
  if (!await isValidDiscordAdmin(cookieHeader, env)) {
    console.log('Unauthorized access attempt to admin API');
    return new Response(
      JSON.stringify({ 
        error: 'Unauthorized',
        message: 'Discord authentication required'
      }),
      { 
        status: 401,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }

  // 暫定対応: VPS Express が利用できない場合はテストデータを返す
  const USE_TEST_DATA = true; // VPS が復旧したら false に変更
  
  if (USE_TEST_DATA) {
    console.log('Returning test data (VPS Express bypass)');
    return new Response(
      JSON.stringify([
        {
          id: 'test-1',
          guild_id: '123456789',
          channel_id: '987654321',
          message_id: '111222333',
          guild_name: 'テストサーバー',
          channel_name: 'テストチャンネル',
          status: 'recruiting',
          start_time: new Date().toISOString(),
          content: 'テスト募集です',
          participants_count: 3,
          start_game_time: new Date(Date.now() + 3600000).toISOString(),
        }
      ]),
      { 
        status: 200,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }

  // 通常の VPS Express へのプロキシ処理...
  const tunnelUrl = env.TUNNEL_URL || env.VPS_EXPRESS_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com';
  // ...
}
```

---

## 永続的な解決策

### Option 1: VPS Express を安定稼働させる

1. **systemd で自動起動設定**:
   ```bash
   # /etc/systemd/system/express-server.service
   [Unit]
   Description=Express Recruitment Server
   After=network.target
   
   [Service]
   Type=simple
   User=your-user
   WorkingDirectory=/path/to/express/app
   ExecStart=/usr/bin/npm start
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

2. **Cloudflare Tunnel も systemd で管理**:
   ```bash
   sudo cloudflared service install
   sudo systemctl enable cloudflared
   sudo systemctl start cloudflared
   ```

3. **ヘルスチェックを追加**:
   Express アプリに `/health` エンドポイントを追加

### Option 2: データベースを Supabase に移行

VPS Express を経由せず、Worker から直接 Supabase にアクセス:

1. 募集データを Supabase の `recruitments` テーブルに保存
2. Worker で直接 Supabase REST API を呼び出し
3. VPS Express は不要になる

---

## チェックリスト

VPS サーバー側:
- [ ] Express サーバーが起動している
- [ ] Cloudflare Tunnel が起動している
- [ ] `/api/recruitment/list` エンドポイントが動作する
- [ ] SERVICE_TOKEN 認証が正しく設定されている

Cloudflare側:
- [ ] Tunnel が "Healthy" 状態
- [ ] Public hostname が正しく設定されている
- [ ] DNS レコードが正しい

Worker側:
- [ ] VPS_EXPRESS_URL が正しい
- [ ] SERVICE_TOKEN が設定されている
- [ ] エラーハンドリングが追加されている（最新のコミット）

---

## テスト方法

### 1. Tunnel URL に直接アクセス

ブラウザで以下にアクセス:
```
https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
```

期待される動作:
- Express サーバーのレスポンスが返る
- エラーページが表示される場合は Tunnel に問題あり

### 2. VPS サーバーでローカルテスト

VPS にSSHログインして:
```bash
curl http://localhost:3000/api/recruitment/list \
  -H "x-service-token: YOUR_SERVICE_TOKEN"
```

### 3. Worker 経由でテスト

ブラウザの開発者ツールで:
```javascript
fetch('https://api.rectbot.tech/api/recruitment/list', {
  credentials: 'include'
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```

---

**まず VPS サーバーの状態を確認してください。サーバーが停止している場合は再起動が必要です。**
