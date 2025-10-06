#!/bin/bash
# VPS 完全修復スクリプト（503エラー対応）

set -e

echo "🔧 RectBot VPS 完全修復（503エラー対応）"
echo "======================================"
echo ""

echo "📊 1. 現在の状態確認..."
echo ""

# Redis確認
echo "Redis状態:"
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis 正常"
    else
        echo "❌ Redis が応答しません - 起動します"
        sudo systemctl start redis-server
        sleep 2
    fi
else
    echo "⚠️  Redis CLI が見つかりません"
fi
echo ""

# PM2プロセス確認
echo "PM2プロセス:"
if command -v pm2 &> /dev/null; then
    pm2 list
else
    echo "❌ PM2 がインストールされていません"
    exit 1
fi
echo ""

echo "======================================"
echo "🛠️  2. ファイルとプロセスを修正..."
echo ""

cd ~/rectbot/bot || {
    echo "❌ ~/rectbot/bot が見つかりません"
    exit 1
}

# .envファイルを正しく設定
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

echo "✅ .env ファイルを作成"
echo ""

# PM2プロセスを停止・削除
echo "既存プロセスを停止..."
pm2 stop all || true
pm2 delete all || true
echo ""

# 新しい設定で起動
echo "サーバーを起動..."
pm2 start pm2-server.config.js
sleep 3
pm2 start ecosystem.config.js
pm2 save

echo "✅ プロセスを起動"
echo ""

echo "======================================"
echo "☁️  3. Cloudflare Tunnel を確認・再起動..."
echo ""

if command -v cloudflared &> /dev/null; then
    echo "cloudflared を再起動..."
    sudo systemctl restart cloudflared
    sleep 3
    
    echo "cloudflared 状態:"
    sudo systemctl status cloudflared --no-pager -l | head -10
    echo ""
    
    echo "✅ Cloudflare Tunnel を再起動"
else
    echo "⚠️  cloudflared がインストールされていません"
    echo ""
    echo "インストール方法:"
    echo "1. https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/"
    echo "2. 既存のTunnel設定を確認"
fi
echo ""

echo "======================================"
echo "🧪 4. 動作確認..."
echo ""

sleep 5

echo "PM2ステータス:"
pm2 list
echo ""

echo "ポート3000の状態:"
netstat -tuln 2>/dev/null | grep ":3000" || ss -tuln | grep ":3000" || echo "❌ ポート3000でリスニングしていません"
echo ""

echo "ローカルAPI接続テスト:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/dashboard/recruitment
echo ""

echo "外部API接続テスト:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://api.rectbot.tech/api/test
echo ""

echo "======================================"
echo "📋 5. 最新ログ"
echo ""
pm2 logs --lines 10 --nostream
echo ""

echo "======================================"
echo "✅ 修復完了！"
echo ""
echo "⚠️  重要な次のステップ:"
echo ""
echo "1. Discord Bot Token を設定"
echo "   nano ~/rectbot/bot/.env"
echo "   YOUR_ACTUAL_TOKEN_HERE を実際のトークンに置き換え"
echo ""
echo "2. トークン設定後、プロセスを再起動"
echo "   pm2 restart all"
echo ""
echo "3. ログを確認"
echo "   pm2 logs"
echo ""
echo "問題が続く場合:"
echo "- Cloudflare Tunnel設定を確認"
echo "- sudo systemctl status cloudflared"
echo "- cloudflared tunnel info"
echo ""