# 🔴 500エラー トラブルシューティングガイド

## エラーの症状

管理画面に以下のエラーが表示される:
```
データ取得エラー:
Failed to fetch: 500
```

## 500エラーの意味

**500 Internal Server Error** は、Cloudflare Worker内部でエラーが発生していることを示しています。

---

## 🔍 原因の特定

500エラーは主に以下の原因で発生します:

### 1. ❌ 環境変数が設定されていない
- `SERVICE_TOKEN` が未設定
- `TUNNEL_URL` または `VPS_EXPRESS_URL` が未設定
- その他の必須環境変数が未設定

### 2. ❌ Tunnel URLが間違っている
- 古いTunnel URLが設定されている
- Tunnel URLの形式が間違っている

### 3. ❌ SERVICE_TOKEN が間違っている
- Worker と VPS Express APIのトークンが一致していない

### 4. ❌ Worker のコード内でエラーが発生
- fetch処理でエラー
- JSONパースエラー
- その他の実行時エラー

---

## 🛠️ 診断手順

### Step 1: ブラウザのコンソールで詳細確認

1. 管理画面を開く: https://dash.rectbot.tech/
2. **F12** キーを押す
3. **Console** タブを開く
4. エラーメッセージを確認

#### 確認すべき情報:
```javascript
API error details: {
  error: "Internal server error",
  message: "...",
  errorType: "...",
  details: "...",
  debugInfo: {
    tunnelUrl: "...",
    serviceTokenConfigured: true/false
  }
}
```

### Step 2: 環境変数チェックエンドポイントを使用

管理画面のコンソールで実行:

```javascript
// 環境変数の状態を確認
fetch('https://api.rectbot.tech/api/debug/env', {
  credentials: 'include'
}).then(r => r.json()).then(console.log);
```

#### 期待される出力:
```json
{
  "envStatus": {
    "DISCORD_CLIENT_ID": true,
    "DISCORD_CLIENT_SECRET": true,
    "DISCORD_REDIRECT_URI": true,
    "JWT_SECRET": true,
    "ADMIN_DISCORD_ID": true,
    "SERVICE_TOKEN": true,
    "TUNNEL_URL": true,
    "VPS_EXPRESS_URL": true,
    "SUPABASE_URL": true,
    "SUPABASE_SERVICE_ROLE_KEY": true
  },
  "tunnelUrlPreview": "https://80cbc750-94a4-4b87..."
}
```

### Step 3: Worker のログを確認

```bash
cd /workspaces/rectbot/backend
wrangler tail
```

このコマンドでWorkerのリアルタイムログが表示されます。

#### 確認すべきログ:
```
Admin API: /api/recruitment/list accessed
JWT validation passed for admin: ...
Proxying to Express API: https://...
Error proxying to Express API: [エラー内容]
Error name: ...
Error message: ...
```

---

## 🔧 修復方法

### ケースA: SERVICE_TOKEN が未設定

#### 症状:
```json
{
  "debugInfo": {
    "serviceTokenConfigured": false
  }
}
```

#### 修復:

1. **Cloudflare Dashboard で設定:**
   - https://dash.cloudflare.com/
   - Workers & Pages → rectbot-backend
   - Settings → Variables
   - `SERVICE_TOKEN` を追加

2. **値を確認:**
   - VPSの `.env` ファイルと同じ値を設定
   ```bash
   # VPSで確認
   ssh user@vps-ip
   cat ~/rectbot/bot/.env | grep SERVICE_TOKEN
   ```

3. **Worker を再デプロイ:**
   ```bash
   cd /workspaces/rectbot/backend
   wrangler deploy
   ```

---

### ケースB: TUNNEL_URL が未設定または間違っている

#### 症状:
```json
{
  "debugInfo": {
    "tunnelUrl": "not set"
  }
}
```

または

```
Error: fetch failed
details: "Failed to connect to VPS Express API"
```

#### 修復:

1. **VPSで正しいTunnel URLを確認:**
   ```bash
   ssh user@vps-ip
   sudo cloudflared tunnel info
   ```

2. **Cloudflare Dashboard で設定:**
   - Settings → Variables
   - `TUNNEL_URL` または `VPS_EXPRESS_URL` を追加
   - 値: VPSで確認したTunnel URL（例: `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com`）

3. **Worker を再デプロイ:**
   ```bash
   wrangler deploy
   ```

---

### ケースC: Tunnel URLは設定されているが接続できない

#### 症状:
```
Error name: FetchError
Error message: fetch failed
```

#### 原因:
1. Cloudflare Tunnel が停止している
2. Tunnel URLが古い（Tunnelを再作成した場合）

#### 修復:

1. **VPSでCloudflare Tunnelを確認:**
   ```bash
   ssh user@vps-ip
   
   # Tunnelの状態確認
   sudo systemctl status cloudflared
   
   # 停止している場合は再起動
   sudo systemctl restart cloudflared
   
   # Tunnel情報を取得
   sudo cloudflared tunnel info
   ```

2. **Tunnel URLが変わっている場合:**
   - 新しいURLをCloudflare Dashboardで設定
   - Worker を再デプロイ

---

### ケースD: その他のエラー

#### Worker内部のエラーの場合:

1. **Worker のログを詳しく確認:**
   ```bash
   wrangler tail --format pretty
   ```

2. **エラースタックトレースを確認:**
   - コンソールに表示されるエラーメッセージ
   - Worker ログのスタックトレース

3. **最新のコードをデプロイ:**
   ```bash
   cd /workspaces/rectbot/backend
   git pull
   wrangler deploy
   ```

---

## 📊 環境変数チェックリスト

以下の環境変数がすべて設定されている必要があります:

### Cloudflare Workers (rectbot-backend)

- [ ] `DISCORD_CLIENT_ID`
- [ ] `DISCORD_CLIENT_SECRET`
- [ ] `DISCORD_REDIRECT_URI`
- [ ] `JWT_SECRET`
- [ ] `ADMIN_DISCORD_ID`
- [ ] **`SERVICE_TOKEN`** ⭐ 重要
- [ ] **`TUNNEL_URL`** または **`VPS_EXPRESS_URL`** ⭐ 重要
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### 設定確認方法:

```bash
# Cloudflare Dashboard で確認
# https://dash.cloudflare.com/
# Workers & Pages → rectbot-backend → Settings → Variables

# または wrangler で確認
cd /workspaces/rectbot/backend
wrangler secret list
```

---

## 🎯 完全な修復フロー

### 1. 環境変数を確認・設定

```bash
# 1. VPSでTunnel URLとSERVICE_TOKENを確認
ssh user@vps-ip
sudo cloudflared tunnel info
cat ~/rectbot/bot/.env | grep SERVICE_TOKEN

# 2. Cloudflare Dashboard で設定
# - TUNNEL_URL を設定
# - SERVICE_TOKEN を設定
```

### 2. Worker を再デプロイ

```bash
cd /workspaces/rectbot/backend
wrangler deploy
```

### 3. VPSのサービスを確認

```bash
ssh user@vps-ip

# すべてのサービスが起動しているか確認
redis-cli ping                    # PONG
pm2 list                          # online
sudo systemctl status cloudflared # active
```

### 4. 動作確認

1. **管理画面を開く**: https://dash.rectbot.tech/
2. **F12 → Console** を開く
3. エラーメッセージを確認
4. 環境変数チェックを実行:
   ```javascript
   fetch('https://api.rectbot.tech/api/debug/env', {
     credentials: 'include'
   }).then(r => r.json()).then(console.log);
   ```

---

## 🔍 デバッグコマンド集

### Worker のリアルタイムログ
```bash
cd /workspaces/rectbot/backend
wrangler tail --format pretty
```

### 環境変数チェック（ブラウザコンソール）
```javascript
fetch('https://api.rectbot.tech/api/debug/env', {
  credentials: 'include'
}).then(r => r.json()).then(console.log);
```

### VPS診断スクリプト
```bash
cd /workspaces/rectbot
./diagnose-vps.sh your-vps-ip
```

### Cloudflare Tunnel 確認
```bash
ssh user@vps-ip
sudo cloudflared tunnel info
sudo cloudflared tunnel list
sudo systemctl status cloudflared
```

---

## ✅ 成功時の表示

### ブラウザコンソール:
```
Fetching recruitments from: https://api.rectbot.tech/api/recruitment/list
Fetched 5 recruitments from API
Total recruitments: 5
Active recruitments: 3
Unique guilds: 2
```

### Worker ログ:
```
Admin API: /api/recruitment/list accessed
JWT validation passed for admin: 726195003780628621
Proxying to Express API: https://...cfargotunnel.com/api/recruitment/list
Express API responded with status: 200
Fetched 5 recruitments from Express API
```

### 管理画面:
- ✅ エラーメッセージが消える
- ✅ 総募集数が表示される
- ✅ アクティブ募集が表示される

---

## 🔗 関連ドキュメント

- `ERROR_503_TROUBLESHOOTING.md` - 503エラーのトラブルシューティング
- `SECURITY_SETUP.md` - 全体のアーキテクチャと環境変数
- `diagnose-vps.sh` - VPS診断スクリプト
- `RECRUITMENT_DATA_UPDATE_FIX.md` - データ更新の仕組み

---

## 💡 よくある質問

### Q: 環境変数を設定したのに500エラーが消えない

A: Worker を再デプロイしましたか？環境変数を変更した後は必ず再デプロイが必要です:
```bash
wrangler deploy
```

### Q: TUNNEL_URL と VPS_EXPRESS_URL はどちらを設定すべき？

A: どちらか一方を設定すれば動作します。Worker は以下の優先順位で使用します:
1. `TUNNEL_URL`
2. `VPS_EXPRESS_URL`
3. デフォルト値（非推奨）

### Q: SERVICE_TOKEN はどこで生成する？

A: 任意の強力なランダム文字列を生成して、Worker と VPS の両方に同じ値を設定します:
```bash
# 生成例
openssl rand -hex 32
```

### Q: デバッグエンドポイント(/api/debug/env)が401エラーになる

A: 管理者としてログインしている必要があります。Discord IDが `ADMIN_DISCORD_ID` に含まれているか確認してください。
