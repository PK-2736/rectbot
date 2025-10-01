# セキュリティ強化後の設定手順

## 実装されたセキュリティ対策

### 1. 認証トークン必須化
- 全ての API エンドポイントで SERVICE_TOKEN が必須
- `/api/public/recruitment` も認証が必要

### 2. レート制限
- `/api/recruitment/push`: 1時間あたり100リクエスト/IP
- `/api/public/recruitment`: 1時間あたり1000リクエスト/IP

### 3. User-Agent 検証
- Discord bot からのリクエストのみ許可
- 怪しい User-Agent をブロック

### 4. 入力サニタイゼーション
- 全ての入力データを制限・サニタイズ
- SQLインジェクション対策

### 5. IP ログ出力
- 不正なアクセス試行をログに記録
- Cloudflare の CF-Connecting-IP ヘッダーを使用

## 必要な環境変数設定

### 1. Cloudflare Worker
```bash
# SERVICE_TOKEN を設定（必須）
npx wrangler secret put SERVICE_TOKEN
# 値: 強力なランダム文字列（64文字以上推奨）
```

### 2. Discord Bot サーバー（.env）
```bash
# 同じ SERVICE_TOKEN を設定
SERVICE_TOKEN=<Worker と同じ値>
```

### 3. Cloudflare Pages
```bash
# Pages 設定で環境変数を追加
NEXT_PUBLIC_SERVICE_TOKEN=<Worker と同じ値>
```

## デプロイ手順

### 1. Worker のデプロイ
```powershell
cd backend
npx wrangler deploy
```

### 2. Discord Bot の再起動
```bash
# Ubuntu サーバーで
pm2 restart rectbot-server --update-env
```

### 3. Pages の再デプロイ
- Cloudflare Pages のダッシュボードで再デプロイ
- または GitHub push でトリガー

## テスト用コマンド

### 認証なしでのテスト（401 エラーになるはず）
```powershell
Invoke-RestMethod -Uri 'https://api.rectbot.tech/api/public/recruitment' -Method Get -Verbose
```

### 認証ありでのテスト（200 OK になるはず）
```powershell
$headers = @{ 'Authorization' = 'Bearer <YOUR_SERVICE_TOKEN>' }
Invoke-RestMethod -Uri 'https://api.rectbot.tech/api/public/recruitment' -Method Get -Headers $headers -Verbose
```

### Discord Bot からの投稿テスト
```powershell
$headers = @{ 
    'Authorization' = 'Bearer <YOUR_SERVICE_TOKEN>'
    'Content-Type' = 'application/json'
    'User-Agent' = 'node-fetch/1.0 discord-bot'
}
$body = @{
    recruitId = "test123"
    guild_id = "123456789"
    content = "テスト募集"
    status = "recruiting"
} | ConvertTo-Json

Invoke-RestMethod -Uri 'https://api.rectbot.tech/api/recruitment/push' -Method Post -Headers $headers -Body $body -Verbose
```

## セキュリティレベル

- **認証**: 必須（SERVICE_TOKEN）
- **レート制限**: 有効
- **IP ログ**: 有効
- **User-Agent 検証**: 有効
- **入力検証**: 強化
- **エラー情報**: 最小限

これにより、公開されていない内部 API として適切なセキュリティレベルが確保されます。