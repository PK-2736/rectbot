#!/bin/bash
# 環境変数を直接設定してPM2起動

set -e

echo "=== 環境変数直接設定方式 ==="
echo ""

cd ~/rectbot/bot

echo "1. 現在の.envファイル内容:"
cat .env | head -10
echo ""

echo "2. PM2プロセスを停止..."
pm2 stop rectbot-server
pm2 delete rectbot-server
echo ""

echo "3. 環境変数を設定してPM2起動..."
SERVICE_TOKEN=rectbot-service-token-2024 \
BACKEND_API_URL=https://api.rectbot.tech \
PORT=3000 \
REDIS_HOST=127.0.0.1 \
REDIS_PORT=6379 \
NODE_ENV=production \
pm2 start server.js --name rectbot-server

pm2 save
echo ""

sleep 3

echo "4. PM2環境変数を確認..."
pm2 env 0 | grep SERVICE_TOKEN
echo ""

echo "5. 動作確認..."
echo "ローカル接続テスト:"
curl -s http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024" \
  | head -10
echo ""

echo "6. Tunnel経由テスト:"
curl -s https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024" \
  | head -10
echo ""

echo "=== 完了 ==="
echo ""
echo "PM2ログを確認:"
echo "  pm2 logs rectbot-server --lines 20"