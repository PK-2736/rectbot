# Cloudflare デプロイ設定

## 必要な環境変数（GitHub Secrets）

フロントエンド（Next.js Dashboard）のデプロイに必要な環境変数：

```
# Cloudflare設定
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id

# Discord OAuth（公開設定）
NEXT_PUBLIC_DISCORD_CLIENT_ID=1048950201974542477
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://dashboard.rectbot.tech
NEXT_PUBLIC_BACKEND_API_URL=https://rectbot-backend.rectbot-owner.workers.dev

# 秘密情報
DISCORD_CLIENT_SECRET=your_discord_client_secret
SUPABASE_URL=https://fkqynvlkwbexbndfxwtf.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Cloudflare APIトークンの権限設定

APIトークンには以下の権限が必要です：

- **Account:Cloudflare Pages:Edit** - Pagesプロジェクトの編集
- **Zone:Zone:Read** - ゾーン情報の読み取り
- **User:User Details:Read** - ユーザー詳細の読み取り
- **Account:Account Settings:Read** - アカウント設定の読み取り

## デプロイ手順

1. **GitHub Secretsの設定**
   - GitHub リポジトリの Settings > Secrets and variables > Actions で上記の環境変数を設定

2. **Cloudflare Pages プロジェクトの作成**
   - Dashboard用: `rectbot-dashboard`
   - Frontend用: `rectbot-frontend`

3. **自動デプロイ**
   - `main` ブランチへのプッシュで自動デプロイ
   - `frontend/` ディレクトリの変更でフロントエンドデプロイ
   - `backend/` ディレクトリの変更でBackendデプロイ

4. **手動デプロイ**
   - GitHub Actions > Deploy to Cloudflare Pages > Run workflow

## プロジェクト構成

- **Frontend (Astro)**: `frontend/astro/` → `rectbot-frontend`
- **Dashboard (Next.js)**: `frontend/dashboard/` → `rectbot-dashboard`
- **Backend (Workers)**: `backend/` → `rectbot-backend` (api.rectbot.tech)

## トラブルシューティング

### 認証エラー (code: 10000)
- CloudflareのAPIトークンの権限を確認
- Account IDが正しく設定されているか確認
- APIトークンが期限切れでないか確認

### Node.js バージョンエラー
- GitHub ActionsでNode.js v20以上を使用
- Wrangler v4.37.1+ はNode.js v20.18.1+が必要

## 確認事項

- Discord OAuth2 リダイレクトURLに本番URLを追加
- Cloudflare KV namespace が適切にバインドされているか確認
- 本番環境のCORS設定確認