# 修正されたアーキテクチャのテスト手順

## 変更内容
1. Worker に `/api/public/recruitment` エンドポイントを追加（ブラウザから直接アクセス可能）
2. Worker が内部で EXPRESS_ORIGIN の `/api/recruitment` に SERVICE_TOKEN 付きでアクセス
3. AdminDashboard が `/api/public/recruitment` を呼び出す

## アーキテクチャフロー
```
Browser → Worker (/api/public/recruitment) → Express (/api/recruitment + SERVICE_TOKEN) → Redis
```

## テストコマンド

### 1. ブラウザ向け公開エンドポイント（認証不要）
```powershell
# 新しい公開エンドポイントをテスト
Invoke-RestMethod -Uri 'https://api.rectbot.tech/api/public/recruitment' -Method Get -Verbose
```

### 2. サーバー間通信エンドポイント（SERVICE_TOKEN必要）
```powershell
# 管理用エンドポイント（SERVICE_TOKENが必要）
$headers = @{ 'Authorization' = 'Bearer 862cf90b910da363c1f727715988c494eac3ed4518fba7b2e19454e4461031ef786f3f922614a864a28a9f06cce6d9c4' }
Invoke-RestMethod -Uri 'https://api.rectbot.tech/api/recruitment' -Method Get -Headers $headers -Verbose
```

### 3. Express に直接アクセス（開発・デバッグ用）
```powershell
# Express サーバーに直接アクセス（EXPRESS_ORIGIN_URLに置き換え）
$headers = @{ 'Authorization' = 'Bearer 862cf90b910da363c1f727715988c494eac3ed4518fba7b2e19454e4461031ef786f3f922614a864a28a9f06cce6d9c4' }
Invoke-RestMethod -Uri 'https://EXPRESS_ORIGIN_URL/api/recruitment' -Method Get -Headers $headers -Verbose
```

## 必要な環境変数設定

### Worker (Cloudflare)
```bash
# EXPRESS_ORIGIN を Express サーバーのURLに設定
npx wrangler secret put EXPRESS_ORIGIN
# 例: https://express-server.example.com または https://your-origin-ip:3000

# SERVICE_TOKEN を設定
npx wrangler secret put SERVICE_TOKEN
# 値: 862cf90b910da363c1f727715988c494eac3ed4518fba7b2e19454e4461031ef786f3f922614a864a28a9f06cce6d9c4
```

### Express (.env)
SERVICE_TOKEN が正しく設定されていることを確認：
```
SERVICE_TOKEN=862cf90b910da363c1f727715988c494eac3ed4518fba7b2e19454e4461031ef786f3f922614a864a28a9f06cce6d9c4
```

### Pages (Cloudflare Pages)
```
NEXT_PUBLIC_WORKER_URL=https://api.rectbot.tech
```

## デプロイとテスト順序
1. Worker をデプロイ: `cd backend && npx wrangler deploy`
2. Express を再起動: `pm2 restart all --update-env`
3. 公開エンドポイントをテスト: `/api/public/recruitment`
4. AdminDashboard でブラウザテスト

## トラブルシューティング
- 401 エラー: SERVICE_TOKEN の設定を確認
- 502 エラー: EXPRESS_ORIGIN の URL を確認
- CORS エラー: Worker の CORS 設定を確認