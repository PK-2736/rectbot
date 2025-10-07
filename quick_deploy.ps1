# 簡易デプロイ手順

# ステップ1: この行のYOUR_TOKEN_HEREを実際のAPI Tokenに置き換えてから実行
$env:CLOUDFLARE_API_TOKEN = "l0e86QrfddQ2ivii7YZF7CL2vxaVxpf-sFoDRCSH"

# ステップ2: デプロイ
cd backend
npx wrangler deploy

# デプロイ成功後、環境変数を設定:

# VPS接続用（必須）
npx wrangler secret put VPS_EXPRESS_URL
# 入力: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com

npx wrangler secret put SERVICE_TOKEN
# 入力: rectbot-service-token-2024

# 動作確認
cd ..
curl https://rectbot-backend.workers.dev/api/status
