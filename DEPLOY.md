# Cloudflare デプロイ設定

## 必要な環境変数（GitHub Secrets）

フロントエンド（Next.js Dashboard）のデプロイに必要な環境変数：

```
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token

# Discord OAuth
DISCORD_CLIENT_ID=1048950201974542477
DISCORD_CLIENT_SECRET=your_discord_client_secret

# NextAuth
NEXTAUTH_URL=https://your-dashboard.pages.dev
NEXTAUTH_SECRET=your_nextauth_secret

# Supabase
SUPABASE_URL=https://fkqynvlkwbexbndfxwtf.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend API
BACKEND_API_URL=https://api.rectbot.tech
```

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

## 確認事項

- Discord OAuth2 リダイレクトURLに本番URLを追加
- Cloudflare KV namespace が適切にバインドされているか確認
- 本番環境のCORS設定確認