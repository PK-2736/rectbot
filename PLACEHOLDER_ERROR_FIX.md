# 🔧 環境変数エラー (placeholder) の修正ガイド

## ❌ 発生したエラー

```
データ取得エラー:
Failed to fetch: 500 - Invalid URL: placeholder/api/recruitment/list
```

## 🔍 原因

`wrangler.toml` の環境変数に "placeholder" という文字列が設定されたままだったため、実際のVPS Express URLが使用されず、無効なURLが生成されていました。

## ✅ 修正内容

以下のファイルを修正しました：

### 1. `/workspaces/rectbot/backend/wrangler.toml`

```toml
[vars]
DISCORD_CLIENT_ID = "1048950201974542477"
DISCORD_REDIRECT_URI = "https://api.rectbot.tech/api/discord/callback"
SUPABASE_URL = "https://placeholder.supabase.co"  # 実際のURLに要変更
VPS_EXPRESS_URL = "https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com"
ADMIN_DISCORD_ID = "726195003780628621"
```

**重要な変更点:**
- ✅ `VPS_EXPRESS_URL`: placeholder → 実際のCloudflare Tunnel URL
- ✅ `DISCORD_CLIENT_ID`: placeholder → 実際のDiscord Client ID
- ✅ `ADMIN_DISCORD_ID`: placeholder → 実際の管理者Discord ID

### 2. 作成したファイル

- **`deploy-worker-with-env.sh`**: 環境変数を含めたデプロイスクリプト
- **`backend/.env.deploy`**: 環境変数のテンプレート

## 🚀 デプロイ手順

### 方法1: Wranglerで直接デプロイ（推奨）

```bash
cd /workspaces/rectbot/backend
npx wrangler deploy
```

このコマンドで、修正した `wrangler.toml` の環境変数が自動的に使用されます。

### 方法2: 環境変数を明示的に指定してデプロイ

```bash
cd /workspaces/rectbot/backend
npx wrangler deploy \
  --var VPS_EXPRESS_URL:https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com \
  --var DISCORD_CLIENT_ID:1048950201974542477 \
  --var ADMIN_DISCORD_ID:726195003780628621
```

## 🔐 シークレットの設定（初回のみ）

以下のシークレットも設定されている必要があります。未設定の場合は設定してください：

```bash
# JWT_SECRET
echo "T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=" | npx wrangler secret put JWT_SECRET

# SERVICE_TOKEN（VPS Express API認証用）
# 既に設定されている場合は不要
npx wrangler secret put SERVICE_TOKEN
# 値: openssl rand -base64 32 で生成

# DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_CLIENT_SECRET
# 値: Discord Developer Portalから取得

# SUPABASE_SERVICE_ROLE_KEY（使用している場合）
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# 値: Supabase Dashboardから取得
```

## 📋 設定確認

デプロイ後、以下で環境変数の設定を確認できます：

```bash
# ブラウザで以下にアクセス（管理者でログインした状態で）
https://api.rectbot.tech/api/debug/env
```

期待される出力例：
```json
{
  "environment": "production",
  "hasRequiredEnvVars": {
    "DISCORD_CLIENT_ID": true,
    "DISCORD_CLIENT_SECRET": true,
    "JWT_SECRET": true,
    "SERVICE_TOKEN": true,
    "TUNNEL_URL": true,
    "VPS_EXPRESS_URL": true,
    "ADMIN_DISCORD_ID": true
  },
  "tunnelUrlPreview": "https://80cbc750-94a4-4b87-b86d-b3..."
}
```

## 🧪 動作確認

1. **管理画面にアクセス**
   ```
   https://dash.rectbot.tech/
   ```

2. **データが正常に表示されることを確認**
   - 総募集数が表示される
   - 募集リストが表示される
   - エラーが発生しない

## 🔄 今後のデプロイ

GitHub Actionsを使用する場合、以下のシークレットをGitHubリポジトリに設定してください：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DISCORD_CLIENT_SECRET`
- `JWT_SECRET`
- `SERVICE_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`

設定後、mainブランチにpushすると自動的にデプロイされます。

## 📝 補足: Supabase URL

現在 `SUPABASE_URL` は "https://placeholder.supabase.co" になっています。

Supabaseを使用している場合は、実際のProject URLに変更してください：

```bash
# Supabase Dashboard → Settings → API → Project URL
cd /workspaces/rectbot/backend
npx wrangler deploy --var SUPABASE_URL:https://YOUR_PROJECT_REF.supabase.co
```

または、`wrangler.toml` を直接編集してから `npx wrangler deploy` を実行してください。

## 🆘 トラブルシューティング

### エラー: "CLOUDFLARE_API_TOKEN not found"

```bash
# Cloudflareにログイン
npx wrangler login
```

ブラウザが開き、Cloudflareアカウントでの認証が求められます。

### エラー: "Account ID required"

`wrangler.toml` の `account_id` が正しく設定されているか確認してください：

```toml
account_id = "74749d85b9c280c0daa93e12ea5d5a14"
```

### まだ "placeholder" エラーが出る場合

1. Workerが正しくデプロイされているか確認：
   ```bash
   cd /workspaces/rectbot/backend
   npx wrangler deployments list
   ```

2. 最新のデプロイメントが表示されていることを確認

3. ブラウザのキャッシュをクリア（Ctrl+Shift+R / Cmd+Shift+R）

## ✅ 完了確認

以下がすべて ✅ になれば完了です：

- [ ] `wrangler.toml` の VPS_EXPRESS_URL が正しい値に設定されている
- [ ] `npx wrangler deploy` が成功した
- [ ] https://api.rectbot.tech/api/debug/env で環境変数が確認できる
- [ ] https://dash.rectbot.tech/ でデータが正常に表示される
- [ ] "placeholder" エラーが出なくなった
