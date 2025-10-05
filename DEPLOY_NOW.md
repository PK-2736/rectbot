# 🚀 クイックデプロイガイド - placeholder エラー修正

## ✅ 修正完了

`wrangler.toml` の環境変数を以下のように修正しました：

```diff
- VPS_EXPRESS_URL = "placeholder"
+ VPS_EXPRESS_URL = "https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com"

- DISCORD_CLIENT_ID = "placeholder"  
+ DISCORD_CLIENT_ID = "1048950201974542477"

- ADMIN_DISCORD_ID = "placeholder"
+ ADMIN_DISCORD_ID = "726195003780628621"
```

## 📦 今すぐデプロイ

以下のコマンドを実行してください：

```bash
cd /workspaces/rectbot/backend
npx wrangler deploy
```

**たったこれだけ！** 修正された環境変数が自動的に使用されます。

## ⏱️ 所要時間: 約30秒

```bash
# 1. backendディレクトリに移動
cd /workspaces/rectbot/backend

# 2. デプロイ（環境変数は自動設定）
npx wrangler deploy
```

## ✅ デプロイ成功の確認

デプロイが成功すると、以下のようなメッセージが表示されます：

```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded rectbot-backend (X.XX sec)
Published rectbot-backend (X.XX sec)
  https://rectbot-backend.xxx.workers.dev
Current Deployment ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 🧪 動作確認

### 1. 環境変数の確認

ブラウザで以下にアクセス（管理者ログイン状態で）：

```
https://api.rectbot.tech/api/debug/env
```

**期待される結果:**
```json
{
  "environment": "production",
  "hasRequiredEnvVars": {
    "VPS_EXPRESS_URL": true,
    "DISCORD_CLIENT_ID": true,
    "ADMIN_DISCORD_ID": true
  },
  "tunnelUrlPreview": "https://80cbc750-94a4-4b87-b86d-b3..."
}
```

### 2. 管理画面の確認

```
https://dash.rectbot.tech/
```

**期待される結果:**
- ✅ データが正常に表示される
- ✅ 「データ取得エラー」が出ない
- ✅ 総募集数が表示される
- ✅ 募集リストが表示される

## 🔐 初回デプロイ時のみ: シークレット設定

もし初めてデプロイする場合、以下のシークレットも設定してください：

```bash
# JWT_SECRET（認証用）
echo "T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=" | npx wrangler secret put JWT_SECRET

# SERVICE_TOKEN（VPS API認証用）- 既存の値があればそれを使用
# 新規生成する場合:
openssl rand -base64 32 | npx wrangler secret put SERVICE_TOKEN
```

**注意:** シークレットは一度設定すれば、再デプロイ時に再設定する必要はありません。

## 🆘 エラーが出た場合

### "You must be logged in to publish" エラー

```bash
npx wrangler login
```

ブラウザが開くので、Cloudflareアカウントでログインしてください。

### まだ "placeholder" エラーが出る

1. **デプロイが最新か確認:**
   ```bash
   cd /workspaces/rectbot/backend
   npx wrangler deployments list
   ```
   最新のデプロイメントが数分以内のものであることを確認。

2. **ブラウザキャッシュをクリア:**
   - Chrome/Edge: `Ctrl + Shift + R` (Windows/Linux) / `Cmd + Shift + R` (Mac)
   - Firefox: `Ctrl + F5` (Windows/Linux) / `Cmd + Shift + R` (Mac)

3. **環境変数デバッグ:**
   ```
   https://api.rectbot.tech/api/debug/env
   ```
   にアクセスして、`VPS_EXPRESS_URL` が `true` になっているか確認。

## 📚 詳細ドキュメント

詳しい説明は以下を参照してください：

- [PLACEHOLDER_ERROR_FIX.md](PLACEHOLDER_ERROR_FIX.md) - 詳細な修正手順
- [DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md) - 通常のデプロイ手順
- [ERROR_500_TROUBLESHOOTING.md](ERROR_500_TROUBLESHOOTING.md) - エラー対処法

## ✨ 完了！

デプロイ後、管理画面で募集データが正常に表示されれば成功です！

問題が解決しない場合は、以下を確認してください：
1. VPSのサービスが稼働しているか ([QUICK_FIX_503.md](QUICK_FIX_503.md) 参照)
2. Cloudflare Tunnelが正常か
3. SERVICE_TOKENが正しく設定されているか
