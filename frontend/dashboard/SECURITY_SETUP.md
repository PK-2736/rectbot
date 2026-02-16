# Dashboard セキュリティ設定

## 概要

Cloudflare Worker を使った安全な認証・認可システムです。フロントエンドには秘密情報を含めず、すべての認証処理は Worker で行います。

### アーキテクチャ

```
ブラウザ → Cloudflare Pages (静的) → Cloudflare Worker (API) → Express API (VPS)
                                       ↑                          ↑
                                    JWT 検証              Service Token 検証
                                    Supabase 連携
```

## ファイル構造

```
rectbot/
├── .github/
│   └── workflows/
│       ├── deploy-worker.yml        # Worker デプロイ
│       ├── deploy-pages.yml         # Pages デプロイ
│       └── deploy-bot.yml           # Bot デプロイ
├── backend/                         # Cloudflare Worker
│   ├── index.js                     # JWT 認証 + Supabase 連携
│   └── wrangler.toml
├── frontend/dashboard/              # Cloudflare Pages
│   ├── src/
│   │   ├── components/
│   │   │   └── AdminDashboard.tsx
│   │   └── app/
│   └── out/                         # ビルド出力
└── bot/                             # Discord Bot (VPS)
    ├── src/
    └── server.js                    # Express API
```

## 認証フロー（Supabase + JWT + Service Token）

### 1. Discord OAuth ログイン

1. ユーザーが Discord OAuth でログイン
2. Worker が Discord API でユーザー情報取得
3. Supabase `users` テーブルに保存／更新
4. JWT を発行し、HttpOnly Cookie として返却

### 2. 管理者 API アクセス

1. ブラウザが Cookie 付きで Worker `/api/recruitment/list` を呼び出し
2. Worker が JWT を検証（管理者チェック）
3. Worker が Express API に Service Token 付きでリクエスト
4. Express がデータ返却 → Worker → ブラウザ

### 3. Bot → Worker → Express のデータフロー

1. Discord Bot が募集データを Redis に保存
2. Express API が Redis からデータ取得
3. Worker が Express API にプロキシ（Service Token 認証）

## 環境変数の設定

### GitHub Secrets（リポジトリ設定）

**Settings → Secrets and variables → Actions → New repository secret**

#### Worker 用

```bash
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=https://dash.recrubo.net/callback

# JWT 認証
JWT_PUBLIC_KEY=your-rs256-public-key-pem
JWT_ISSUER_URL=https://oci.example.com
SERVICE_JWT_PUBLIC_KEY=your-service-rs256-public-key-pem

# 管理者設定
ADMIN_DISCORD_ID=admin-discord-id-1,admin-discord-id-2

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Service Token（Worker → Express）
SERVICE_TOKEN=your-service-token

# Express API URL
VPS_EXPRESS_URL=https://api.recrubo.net
```

#### Pages 用

**重要**: Cloudflare Pagesは静的サイトホスティングのため、シークレット（秘密情報）を保持できません。
ビルド時に埋め込まれる公開変数のみを使用します。

```bash
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# 公開変数（NEXT_PUBLIC_*）
NEXT_PUBLIC_DISCORD_CLIENT_ID=your-discord-client-id
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://dash.recrubo.net/auth/callback
NEXT_PUBLIC_API_BASE_URL=https://api.recrubo.net
NEXT_PUBLIC_ADMIN_IDS=admin-discord-id-1,admin-discord-id-2
```

**注意事項**:
- ✅ これらの値はブラウザで見える（公開情報）
- ❌ シークレット（JWT_PRIVATE_KEY、CLIENT_SECRET等）は含めない
- ✅ 秘密情報が必要な処理はすべてWorker経由で行う

#### Bot (VPS) 用

```bash
# VPS へのデプロイ用
VPS_SSH_KEY=your-vps-ssh-private-key
VPS_HOST=your-vps-ip-or-hostname
VPS_USER=ubuntu

# Discord Bot
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id

# Service Token（Worker からの認証）
SERVICE_TOKEN=your-service-token

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# Backend API
BACKEND_API_URL=https://api.recrubo.net
```

## デプロイ手順（GitHub Actions）

### 1. Worker のデプロイ

**実際のファイル:** `.github/workflows/deploy-cloudflare-workers.yml`

```yaml
name: Deploy to Cloudflare Workers
on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/deploy-cloudflare-workers.yml'
  workflow_dispatch:

jobs:
  cloudflare-deploy:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Bun
        run: curl -fsSL https://bun.sh/install | bash
        
      - name: Install dependencies
        run: |
          cd backend
          bun install
          npm install wrangler
      
      - name: Register Secrets
        run: |
          cd backend
          # シークレットの登録
          echo "${{ secrets.DISCORD_CLIENT_SECRET }}" | npx wrangler secret put DISCORD_CLIENT_SECRET
          echo "${{ secrets.JWT_PUBLIC_KEY }}" | npx wrangler secret put JWT_PUBLIC_KEY
          echo "${{ secrets.JWT_ISSUER_URL }}" | npx wrangler secret put JWT_ISSUER_URL
          echo "${{ secrets.SERVICE_JWT_PUBLIC_KEY }}" | npx wrangler secret put SERVICE_JWT_PUBLIC_KEY
          echo "${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
          echo "${{ secrets.SERVICE_TOKEN }}" | npx wrangler secret put SERVICE_TOKEN
          
          # 公開変数の登録
          echo "${{ secrets.DISCORD_CLIENT_ID }}" | npx wrangler secret put DISCORD_CLIENT_ID
          echo "${{ secrets.SUPABASE_URL }}" | npx wrangler secret put SUPABASE_URL
          echo "${{ secrets.ADMIN_DISCORD_ID }}" | npx wrangler secret put ADMIN_DISCORD_ID
      
      - name: Deploy to Cloudflare Workers
        run: |
          cd backend
          npx wrangler deploy --compatibility-date=2024-01-01
```

### 2. Pages のデプロイ

**実際のファイル:** `.github/workflows/deploy-cloudflare-pages.yml`

```yaml
name: Deploy to Cloudflare Pages
on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'
      - '.github/workflows/deploy-cloudflare-pages.yml'
  workflow_dispatch:

jobs:
  cloudflare-pages-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'frontend/dashboard/package-lock.json'
      
      - name: Install dependencies
        run: |
          cd frontend/dashboard
          npm ci
          npm install -g wrangler
      
      - name: Build Dashboard
        env:
          NEXT_PUBLIC_DISCORD_CLIENT_ID: ${{ secrets.DISCORD_CLIENT_ID }}
          NEXT_PUBLIC_DISCORD_REDIRECT_URI: ${{ secrets.DISCORD_REDIRECT_URI }}
          NEXT_PUBLIC_API_BASE_URL: ${{ secrets.NEXT_PUBLIC_API_BASE_URL }}
          NEXT_PUBLIC_ADMIN_IDS: ${{ secrets.ADMIN_DISCORD_ID }}
        run: |
          cd frontend/dashboard
          npm run build
          npm run export
      
      - name: Deploy to Cloudflare Pages
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          cd frontend/dashboard
          wrangler pages deploy ./out --project-name=rectbot-dashboard
```
### 3. Bot (VPS) のデプロイ

**実際のファイル:** `.github/workflows/deploy-oci.yml`

```yaml
name: Deploy to OCI
on:
  push:
    branches: [main]
    paths:
      - 'bot/**'
  workflow_dispatch:

jobs:
  oci-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up SSH key
        env:
          OCI_SSH_KEY: ${{ secrets.OCI_SSH_KEY }}
        run: |
          mkdir -p ~/.ssh
          echo "$OCI_SSH_KEY" | base64 -d > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H ${{ secrets.OCI_HOST }} >> ~/.ssh/known_hosts
      
      - name: Deploy to VPS
        env:
          OCI_USER: ${{ secrets.OCI_USER }}
          OCI_HOST: ${{ secrets.OCI_HOST }}
          SERVICE_TOKEN: ${{ secrets.SERVICE_TOKEN }}
          DISCORD_BOT_TOKEN: ${{ secrets.DISCORD_BOT_TOKEN }}
          BACKEND_API_URL: ${{ secrets.BACKEND_API_URL }}
        run: |
          ssh -i ~/.ssh/id_ed25519 $OCI_USER@$OCI_HOST '
            cd ~/rectbot/bot
            git pull
            npm ci
            pm2 restart rectbot --update-env
            pm2 restart rectbot-server --update-env
          '
```

## セキュリティポイント

✅ **JWT は短命（1時間）**
- 期限切れで自動的に再ログイン要求
- HttpOnly Cookie でブラウザに保存（XSS 対策）

✅ **Supabase でユーザー管理**
- Discord ID、ロール、最終ログイン時刻を保存
- Service Role Key は Worker 内でのみ使用

✅ **Service Token で Express 保護**
- Worker からのリクエストのみ許可
- 外部からの直接アクセスを防止

✅ **3層認証**
1. ブラウザ → Worker: JWT Cookie
2. Worker → Express: Service Token
3. Express → Redis: ローカル接続

✅ **静的ホスティング + Worker API**
- フロントエンドは完全静的（Cloudflare Pages）
- API 処理は Worker で実行（サーバーレス）

✅ **GitHub Secrets でシークレット管理**
- すべての秘密情報は GitHub Secrets に保存
- ワークフロー実行時のみ環境変数として注入
- コードに秘密情報を含めない

## トラブルシューティング

### 401 エラーが出る場合

1. JWT Cookie が正しく設定されているか確認
2. `ADMIN_DISCORD_ID` に自分の Discord ID が含まれているか確認
3. ブラウザの Cookie を確認（DevTools → Application → Cookies）

### デプロイが失敗する場合

1. GitHub Secrets が正しく設定されているか確認
2. Cloudflare API Token の権限を確認
3. ワークフローのログを確認（Actions タブ）

### Worker のログを確認

```bash
# ローカルで確認
npx wrangler tail

# または Cloudflare Dashboard で確認
Workers & Pages → rectbot-api → Logs
```

### ローカル開発

```bash
# Worker をローカルで起動（ポート 8787）
cd backend
npx wrangler dev

# Pages をローカルで起動（ポート 3000）
cd frontend/dashboard
npm run dev
```

## Worker サンプルコード

### JWT 発行（ログイン時）

```javascript
async function handleDiscordCallback(code, env) {
  // Discord トークン取得
  const tokenData = await getDiscordToken(code, env.DISCORD_REDIRECT_URI, env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET);
  
  // Discord ユーザー情報取得
  const userInfo = await getDiscordUser(tokenData.access_token);
  
  // Supabase にユーザー情報保存
  const supabase = getSupabaseClient(env);
  await supabase.from('users').upsert({
    user_id: userInfo.id,
    discord_id: userInfo.id,
    username: userInfo.username,
    role: isAdmin(userInfo.id, env) ? 'admin' : 'user',
    last_login: new Date().toISOString()
  });
  
  // JWT 発行
  const jwt = await issueJWT(userInfo, env);
  
  return { jwt, userInfo };
}
```

### JWT 検証 + Express 呼び出し

```javascript
async function handleAdminAPI(request, env) {
  // Cookie から JWT 取得
  const cookieHeader = request.headers.get('Cookie');
  const jwtMatch = cookieHeader?.match(/jwt=([^;]+)/);
  
  if (!jwtMatch) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  
  // JWT 検証
  const payload = await verifyJWT(jwtMatch[1], env);
  
  if (!payload || payload.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  
  // Express API 呼び出し
  const resp = await fetch(`${env.VPS_EXPRESS_URL}/api/recruitment/list`, {
    headers: {
      'x-service-token': env.SERVICE_TOKEN
    }
  });
  
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## 参考リンク

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Wrangler Action](https://github.com/cloudflare/wrangler-action)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Discord OAuth2](https://discord.com/developers/docs/topics/oauth2)
