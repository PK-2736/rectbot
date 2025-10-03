# Dashboard セキュリティ設定

## 概要

フロントエンドにトークンを含めないセキュアな設計に変更しました。

### アーキテクチャ

```
ブラウザ → Cloudflare Pages (静的) → Pages Functions (API Proxy) → Backend API
                                       ↑ ここでトークンを付与
```

## ファイル構造

```
frontend/dashboard/
├── src/
│   ├── components/
│   │   └── AdminDashboard.tsx  # トークンなしで /api/* を呼び出し
│   └── app/
│       └── page.tsx
├── functions/                   # Cloudflare Pages Functions
│   └── api/
│       ├── recruitment.ts      # GET /api/recruitment (プロキシ)
│       └── cleanup.ts          # POST /api/cleanup (プロキシ)
├── out/                        # ビルド出力 (静的ファイル)
└── wrangler.toml
```

## 環境変数の設定

### Cloudflare Pages の設定画面で設定する環境変数

**Production 環境:**
```
BACKEND_API_URL=https://api.rectbot.tech
CF_ACCESS_CLIENT_ID=your-client-id-here
CF_ACCESS_CLIENT_SECRET=your-client-secret-here
DEPLOY_SECRET=your-deploy-secret-here
```

**Preview 環境（オプション）:**
```
BACKEND_API_URL=https://api.rectbot.tech
CF_ACCESS_CLIENT_ID=your-preview-client-id
CF_ACCESS_CLIENT_SECRET=your-preview-client-secret
DEPLOY_SECRET=your-preview-deploy-secret
```

### ローカル開発用 (.env.local)

```bash
# フロントエンド用（公開される）
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3000
NEXT_PUBLIC_DISCORD_CLIENT_ID=your-discord-client-id
NEXT_PUBLIC_ADMIN_IDS=admin-user-id-1,admin-user-id-2

# Pages Functions用（公開されない）
BACKEND_API_URL=http://localhost:3000
CF_ACCESS_CLIENT_ID=your-client-id
CF_ACCESS_CLIENT_SECRET=your-client-secret
DEPLOY_SECRET=your-deploy-secret
```

## デプロイ手順

### 1. ビルド

```bash
cd frontend/dashboard
npm run build
```

### 2. Cloudflare Pages へデプロイ

```bash
npx wrangler pages deploy out --project-name=rectbot-dashboard
```

### 3. 環境変数の設定

Cloudflare Dashboard → Pages → rectbot-dashboard → Settings → Environment variables

で、上記の環境変数を設定します。

## セキュリティポイント

✅ **トークンはフロントエンドに含まれません**
- `CF_ACCESS_CLIENT_SECRET` と `DEPLOY_SECRET` は Pages Functions でのみ使用
- ブラウザには送信されない

✅ **CORS の心配なし**
- すべてのリクエストは同じドメイン内 (`/api/*`)

✅ **静的ファイル + サーバーレス関数**
- ほとんどは静的配信（高速）
- API 呼び出し時のみ Functions が実行

## トラブルシューティング

### 401 エラーが出る場合

1. Cloudflare Pages の環境変数が正しく設定されているか確認
2. `CF_ACCESS_CLIENT_ID` と `CF_ACCESS_CLIENT_SECRET` が正しいか確認
3. Backend API のトークン設定を確認

### Functions が動作しない場合

1. `functions/` ディレクトリがデプロイに含まれているか確認
2. Cloudflare Pages のログを確認
3. `wrangler pages deploy` でデプロイされたか確認

### ローカル開発で Functions をテストする場合

```bash
npx wrangler pages dev out --local
```

## 参考リンク

- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
- [Environment variables](https://developers.cloudflare.com/pages/platform/functions/bindings/#environment-variables)
