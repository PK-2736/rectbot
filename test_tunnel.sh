#!/bin/bash
# Tunnel経由の接続確認

echo "=== Cloudflare Tunnel 接続確認 ==="
echo ""

TUNNEL_URL="https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com"

echo "1. Tunnel経由でダッシュボードAPIテスト..."
echo "URL: $TUNNEL_URL/api/dashboard/recruitment"
RESPONSE=$(curl -s "$TUNNEL_URL/api/dashboard/recruitment")
echo "Response: $RESPONSE"
echo ""

echo "2. Tunnel経由で管理者APIテスト（SERVICE_TOKEN付き）..."
echo "URL: $TUNNEL_URL/api/recruitment/list"
RESPONSE=$(curl -s "$TUNNEL_URL/api/recruitment/list" \
  -H "x-service-token: rectbot-service-token-2024")
echo "Response: $RESPONSE"
echo ""

if echo "$RESPONSE" | grep -q "Unauthorized"; then
    echo "❌ 認証エラー"
elif echo "$RESPONSE" | grep -q "error"; then
    echo "⚠️  エラーが発生"
    echo "$RESPONSE"
else
    echo "✅ Tunnel経由でも正常に動作しています！"
fi
echo ""

echo "=== 確認完了 ==="
echo ""
echo "次のステップ:"
echo "1. Cloudflare Dashboard で Worker の環境変数を設定"
echo "   - VPS_EXPRESS_URL = $TUNNEL_URL"
echo "   - SERVICE_TOKEN = rectbot-service-token-2024"
echo ""
echo "2. 設定手順は WORKER_ENV_SETUP.md を参照"