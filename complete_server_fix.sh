#!/bin/bash
# 完全な環境変数修正と再デプロイスクリプト

set -e

echo "🔧 RectBot 完全修復スクリプト"
echo "======================================"
echo ""

cd ~/rectbot/bot || {
    echo "❌ エラー: ~/rectbot/bot ディレクトリが見つかりません"
    exit 1
}

echo "📝 1. 現在の状態を確認..."
echo ""
echo "=== PM2プロセス一覧 ==="
pm2 list
echo ""

echo "=== 現在のBACKEND_API_URL設定 ==="
if [ -f .env ]; then
    grep "BACKEND_API_URL" .env || echo ".envにBACKEND_API_URLなし"
fi
echo ""

echo "======================================"
echo "🛠️  2. ファイルを修正します..."
echo ""

# .envファイルを作成/修正
cat > .env << 'EOF'
DISCORD_BOT_TOKEN=YOUR_ACTUAL_TOKEN_HERE
SERVICE_TOKEN=rectbot-service-token-2024
INTERNAL_SECRET=rectbot-internal-secret-2024
BACKEND_API_URL=https://api.rectbot.tech
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
NODE_ENV=production
EOF

echo "✅ .env ファイルを作成しました"
echo ""

# ecosystem.config.jsを修正
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'rectbot',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || 'YOUR_DISCORD_TOKEN_HERE',
        SERVICE_TOKEN: process.env.SERVICE_TOKEN || 'rectbot-service-token-2024',
        INTERNAL_SECRET: process.env.INTERNAL_SECRET || 'rectbot-internal-secret-2024',
        BACKEND_API_URL: process.env.BACKEND_API_URL || 'https://api.rectbot.tech',
        REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
        REDIS_DB: process.env.REDIS_DB || '0',
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

echo "✅ ecosystem.config.js を作成しました"
echo ""

# pm2-server.config.jsを修正
cat > pm2-server.config.js << 'EOF'
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
        INTERNAL_SECRET: process.env.INTERNAL_SECRET || 'rectbot-internal-secret-2024',
        PORT: process.env.PORT || '3000',
        REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

echo "✅ pm2-server.config.js を作成しました"
echo ""

echo "======================================"
echo "🔄 3. PM2プロセスを再起動..."
echo ""

# 既存プロセスを停止・削除
pm2 stop all || true
pm2 delete all || true

# 新しい設定で起動
pm2 start ecosystem.config.js
pm2 start pm2-server.config.js

# 設定を保存
pm2 save

echo "✅ プロセスを再起動しました"
echo ""

# 少し待機
sleep 5

echo "======================================"
echo "📊 4. 動作確認..."
echo ""

echo "=== PM2ステータス ==="
pm2 list
echo ""

echo "=== ログ（最新10行）==="
pm2 logs --lines 10 --nostream
echo ""

echo "======================================"
echo "✅ 修復完了！"
echo ""
echo "⚠️  重要: Discord Bot Token を設定してください"
echo ""
echo "1. Discord Developer Portal でトークンを取得"
echo "   https://discord.com/developers/applications"
echo ""
echo "2. .env ファイルを編集"
echo "   nano .env"
echo ""
echo "3. YOUR_ACTUAL_TOKEN_HERE を実際のトークンに置き換え"
echo ""
echo "4. プロセスを再起動"
echo "   pm2 restart all"
echo ""
echo "ログをリアルタイムで確認:"
echo "  pm2 logs"
echo ""