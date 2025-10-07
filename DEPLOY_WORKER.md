# Cloudflare Worker デプロイ手順

## 🚨 現在の状況

SSL証明書エラーが出ているため、まず `workers.dev` ドメインで動作確認します。

## 📝 デプロイ手順

### ステップ1: Cloudflare認証

```powershell
cd backend
npx wrangler login
```

ブラウザが開いたら：
1. Cloudflareにログイン
2. 「Allow」をクリックして認証を許可

### ステップ2: Workerをデプロイ

```powershell
npx wrangler deploy
```

デプロイが成功すると以下のようなメッセージが表示されます：
```
Published rectbot-backend (0.01 sec)
  https://rectbot-backend.workers.dev
```

### ステップ3: 環境変数を設定

#### 必須の環境変数（優先度順）：

1. **VPS接続用（最優先）**
   ```powershell
   npx wrangler secret put VPS_EXPRESS_URL
   # 入力: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
   
   npx wrangler secret put SERVICE_TOKEN
   # 入力: rectbot-service-token-2024
   ```

2. **Discord OAuth用**
   ```powershell
   npx wrangler secret put DISCORD_CLIENT_ID
   # 入力: Discord Developer Portal からコピー
   
   npx wrangler secret put DISCORD_CLIENT_SECRET
   # 入力: Discord Developer Portal からコピー
   
   npx wrangler secret put DISCORD_REDIRECT_URI
   # 入力: https://rectbot-backend.workers.dev/api/discord/callback
   
   npx wrangler secret put JWT_SECRET
   # 入力: ランダムな32文字以上の文字列
   
   npx wrangler secret put ADMIN_DISCORD_ID
   # 入力: あなたのDiscord User ID
   ```

#### JWT_SECRET を生成:

```powershell
# PowerShellでランダム文字列を生成
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### ステップ4: 動作確認

```powershell
# Status確認
curl https://rectbot-backend.workers.dev/api/status

# 募集データ確認（VPS経由）
curl https://rectbot-backend.workers.dev/api/dashboard/recruitment
```

### ステップ5: VPS環境変数を更新

workers.devドメインを使用する場合、VPSのBOT設定も更新が必要です：

```bash
# VPSにSSH接続して実行
cd ~/rectbot/bot
nano .env

# 以下の行を変更:
# BACKEND_API_URL=https://rectbot-backend.workers.dev

# PM2を再起動
pm2 restart all
pm2 logs rectbot
```

---

## 🔄 カスタムドメイン設定（オプション）

workers.devで動作確認できたら、カスタムドメインを設定します。

### 方法1: Cloudflare Dashboard で設定（推奨）

1. https://dash.cloudflare.com → **Workers & Pages**
2. **rectbot-backend** → **Settings** → **Triggers**
3. **Custom Domains** → **Add Custom Domain**
4. `api.rectbot.tech` を入力
5. **Add Domain**

### 方法2: wrangler.toml で設定

```toml
name = "rectbot-backend"
account_id = "74749d85b9c280c0daa93e12ea5d5a14"
route = { pattern = "api.rectbot.tech/*", zone_name = "rectbot.tech" }
main = "index.js"
compatibility_date = "2025-09-11"
workers_dev = true
```

再デプロイ:
```powershell
npx wrangler deploy
```

### 確認:

カスタムドメインが有効になるまで5-15分かかります。

```powershell
# DNS確認
nslookup api.rectbot.tech 1.1.1.1

# SSL確認
curl https://api.rectbot.tech/api/status
```

---

## 🐛 トラブルシューティング

### エラー: "Timed out waiting for authorization code"

**解決方法:**
1. ブラウザで以下のURLを開く:
   ```
   https://dash.cloudflare.com
   ```
2. ログインしておく
3. 再度 `npx wrangler login` を実行

### エラー: "SSL/TLS のセキュリティで保護されているチャネルに対する信頼関係を確立できませんでした"

**原因:** カスタムドメインのSSL設定が不完全

**解決方法:**
1. まず workers.dev で動作確認（これはSSLエラーが出ない）
2. Cloudflare Dashboard でカスタムドメインを追加
3. 5-15分待つ
4. 再テスト

### エラー: "Error: 10013"

**原因:** route設定とCustom Domainが競合

**解決方法:**
1. wrangler.toml の route 行をコメントアウト
2. Dashboard でのみ Custom Domain を設定
3. 再デプロイ

---

## ✅ チェックリスト

デプロイ前の確認:

- [ ] `npx wrangler login` で認証済み
- [ ] `backend/wrangler.toml` が正しく設定されている
- [ ] Discord Developer Portal でRedirect URIを設定済み
- [ ] すべての環境変数を準備済み

デプロイ後の確認:

- [ ] `https://rectbot-backend.workers.dev/api/status` が動作
- [ ] すべての環境変数が `true` になっている
- [ ] VPS BotのBACKEND_API_URLを更新済み
- [ ] PM2を再起動済み

---

## 📞 サポート

デプロイに問題がある場合、以下の情報を共有してください：

1. `npx wrangler deploy` の出力結果
2. `curl https://rectbot-backend.workers.dev/api/status` の結果
3. エラーメッセージの全文

より詳細なサポートができます！
