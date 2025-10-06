#!/bin/bash
# BACKEND_API_URL修正スクリプト

set -e

echo "🔧 BACKEND_API_URL 修正スクリプト"
echo "======================================"
echo ""

cd ~/rectbot/bot || {
    echo "❌ エラー: ~/rectbot/bot ディレクトリが見つかりません"
    exit 1
}

echo "📝 1. 現在の環境変数を確認..."
echo ""

# .envファイルを確認
if [ -f .env ]; then
    echo "=== .env ファイル内容 ==="
    grep -E "BACKEND_API_URL|SERVICE_TOKEN|DISCORD_BOT_TOKEN" .env || echo "該当する環境変数が見つかりません"
    echo ""
fi

# PM2の環境変数を確認
if command -v pm2 &> /dev/null; then
    echo "=== PM2環境変数 ==="
    pm2 env 0 2>/dev/null | grep -E "BACKEND_API_URL" || echo "PM2環境変数に該当なし"
    echo ""
fi

# ecosystem.config.jsを確認
if [ -f ecosystem.config.js ]; then
    echo "=== ecosystem.config.js の BACKEND_API_URL ==="
    grep -A 2 "BACKEND_API_URL" ecosystem.config.js || echo "設定が見つかりません"
    echo ""
fi

# pm2-server.config.jsを確認
if [ -f pm2-server.config.js ]; then
    echo "=== pm2-server.config.js の BACKEND_API_URL ==="
    grep -A 2 "BACKEND_API_URL" pm2-server.config.js || echo "設定が見つかりません"
    echo ""
fi

echo "======================================"
echo "🔧 2. BACKEND_API_URL を修正します..."
echo ""

# .envファイルを修正
if [ -f .env ]; then
    # 既存のBACKEND_API_URLを削除
    sed -i '/^BACKEND_API_URL=/d' .env
    # 正しいURLを追加
    echo "BACKEND_API_URL=https://api.rectbot.tech" >> .env
    echo "✅ .env ファイルを修正しました"
else
    echo "BACKEND_API_URL=https://api.rectbot.tech" > .env
    echo "✅ .env ファイルを作成しました"
fi
echo ""

# ecosystem.config.jsを修正（存在する場合）
if [ -f ecosystem.config.js ]; then
    echo "📝 ecosystem.config.js を修正..."
    # バックアップ
    cp ecosystem.config.js ecosystem.config.js.bak
    # 修正
    sed -i "s|https://api.pwy.rectbot.tech|https://api.rectbot.tech|g" ecosystem.config.js
    sed -i "s|http://localhost:8787|https://api.rectbot.tech|g" ecosystem.config.js
    echo "✅ ecosystem.config.js を修正しました"
    echo ""
fi

# pm2-server.config.jsを修正（存在する場合）
if [ -f pm2-server.config.js ]; then
    echo "📝 pm2-server.config.js を修正..."
    # バックアップ
    cp pm2-server.config.js pm2-server.config.js.bak
    # 修正
    sed -i "s|https://api.pwy.rectbot.tech|https://api.rectbot.tech|g" pm2-server.config.js
    sed -i "s|http://localhost:8787|https://api.rectbot.tech|g" pm2-server.config.js
    echo "✅ pm2-server.config.js を修正しました"
    echo ""
fi

echo "======================================"
echo "🔄 3. プロセスを再起動..."
echo ""

# PM2プロセスを再起動
pm2 restart all
echo "✅ プロセスを再起動しました"
echo ""

# 少し待機
sleep 3

echo "======================================"
echo "✅ 修正完了！"
echo ""

echo "📋 確認: 新しい環境変数"
pm2 logs --lines 5 --nostream
echo ""

echo "次のステップ:"
echo "1. pm2 logs rectbot-server --lines 10"
echo "2. BACKEND_API_URL が https://api.rectbot.tech になっているか確認"
echo ""