#!/bin/bash
# PM2設定を修正してdotenvを使用

set -e

echo "=== PM2設定修正（dotenv使用）==="
echo ""

cd ~/rectbot/bot

echo "1. pm2-server.config.jsを修正..."

cat > pm2-server.config.js << 'EOF'
/**
 * PM2 config for the origin Express server (server.js)
 * Usage:
 *   pm2 start pm2-server.config.js --env production
 */

// .envファイルを読み込む
require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'rectbot-server',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        SERVICE_TOKEN: process.env.SERVICE_TOKEN || 'rectbot-service-token-2024',
        BACKEND_API_URL: process.env.BACKEND_API_URL || 'https://api.rectbot.tech',
        INTERNAL_SECRET: process.env.INTERNAL_SECRET || '',
        PORT: process.env.PORT || '3000',
        REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

echo "✅ pm2-server.config.jsを更新しました"
echo ""

echo "2. dotenvパッケージをインストール（既にある場合はスキップ）..."
npm list dotenv &>/dev/null || npm install dotenv
echo ""

echo "3. .envファイルを確認..."
cat .env | grep SERVICE_TOKEN
echo ""

echo "4. PM2プロセスを完全再起動..."
pm2 stop rectbot-server
pm2 delete rectbot-server
pm2 start pm2-server.config.js
pm2 save

sleep 3
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
    echo "PM2ログを確認:"
    pm2 logs rectbot-server --lines 10 --nostream
else
    echo "✅ 認証成功！"
fi
echo ""

echo "=== 完了 ==="