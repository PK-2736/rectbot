#!/bin/bash
# SERVICE_TOKEN修正スクリプト

set -e

echo "=== SERVICE_TOKEN 修正 ==="
echo ""

cd ~/rectbot/bot

echo "1. 現在の.envファイルを確認..."
if [ -f .env ]; then
    echo "SERVICE_TOKEN設定:"
    grep "SERVICE_TOKEN" .env || echo "設定なし"
else
    echo ".envファイルが存在しません"
fi
echo ""

echo "2. .envファイルを修正..."
# SERVICE_TOKENが既に存在する場合は削除
sed -i '/^SERVICE_TOKEN=/d' .env 2>/dev/null || true

# 新しいSERVICE_TOKENを追加
echo "SERVICE_TOKEN=rectbot-service-token-2024" >> .env

echo "✅ .envファイルを更新しました"
echo ""

echo "3. 更新後の設定を確認..."
grep "SERVICE_TOKEN" .env
echo ""

echo "4. PM2プロセスを再起動..."
pm2 restart rectbot-server
pm2 restart rectbot 2>/dev/null || echo "rectbot not running"

sleep 3
echo ""

echo "5. 動作確認..."
echo "ローカル接続テスト:"
curl -s http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024" \
  | head -5
echo ""

echo "=== 完了 ==="
echo ""
echo "次のステップ:"
echo "1. Cloudflare WorkerのSERVICE_TOKENも同じ値に設定"
echo "2. Tunnel URLをWorkerに設定: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com"