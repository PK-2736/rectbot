#!/bin/bash
# SERVICE_TOKEN修正スクリプト（環境変数強制更新版）

set -e

echo "=== SERVICE_TOKEN 修正（環境変数強制更新）==="
echo ""

cd ~/rectbot/bot

echo "1. 現在のPM2環境変数を確認..."
pm2 env 0 | grep SERVICE_TOKEN || echo "環境変数なし"
echo ""

echo "2. .envファイルを確認・修正..."
# SERVICE_TOKENが既に存在する場合は削除
sed -i '/^SERVICE_TOKEN=/d' .env 2>/dev/null || true

# 新しいSERVICE_TOKENを追加
echo "SERVICE_TOKEN=rectbot-service-token-2024" >> .env

echo "✅ .envファイル内容:"
cat .env
echo ""

echo "3. PM2プロセスを完全再起動（--update-env付き）..."
pm2 stop rectbot-server
pm2 delete rectbot-server

# pm2-server.config.jsから再起動
pm2 start pm2-server.config.js --update-env
pm2 save

echo "✅ プロセスを再起動しました"
sleep 3
echo ""

echo "4. 新しい環境変数を確認..."
pm2 env 0 | grep SERVICE_TOKEN || echo "環境変数が設定されていません"
echo ""

echo "5. 動作確認..."
echo "ローカル接続テスト:"
RESPONSE=$(curl -s http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024")

echo "$RESPONSE" | head -10
echo ""

if echo "$RESPONSE" | grep -q "Unauthorized"; then
    echo "❌ まだ認証エラーが発生しています"
    echo ""
    echo "デバッグ情報:"
    echo "- server.jsが正しくSERVICE_TOKENを読み込んでいるか確認"
    echo "- pm2 logs rectbot-server --lines 20"
else
    echo "✅ 認証成功！"
fi
echo ""

echo "=== 完了 ==="
echo ""
echo "次のステップ:"
echo "1. pm2 logs rectbot-server でログを確認"
echo "2. Cloudflare WorkerのSERVICE_TOKENも同じ値に設定"
echo "3. Tunnel URLをWorkerに設定"