#!/bin/bash
# VPS Express サーバー クイック修復スクリプト

set -e

echo "🔧 Rectbot VPS Express クイック修復"
echo "======================================"
echo ""

# 1. ディレクトリに移動
echo "📁 1. bot ディレクトリに移動..."
cd ~/rectbot/bot || {
    echo "❌ エラー: ~/rectbot/bot ディレクトリが見つかりません"
    exit 1
}
echo "✅ 完了"
echo ""

# 2. .env ファイルの確認
echo "📝 2. .env ファイルを確認..."
if [ ! -f .env ]; then
    echo "⚠️  .env ファイルが見つかりません。作成します..."
    touch .env
    echo "✅ .env ファイルを作成しました"
else
    echo "✅ .env ファイルが存在します"
fi
echo ""

# 3. SERVICE_TOKEN の確認
echo "🔑 3. SERVICE_TOKEN を確認..."
if grep -q "^SERVICE_TOKEN=" .env; then
    echo "✅ SERVICE_TOKEN が設定されています"
else
    echo "⚠️  SERVICE_TOKEN が設定されていません"
    echo ""
    echo "GitHub Secrets から SERVICE_TOKEN をコピーしてください:"
    echo "https://github.com/PK-2736/rectbot/settings/secrets/actions"
    echo ""
    read -p "SERVICE_TOKEN を入力してください（Enter でスキップ）: " token
    if [ -n "$token" ]; then
        echo "SERVICE_TOKEN=$token" >> .env
        echo "✅ SERVICE_TOKEN を追加しました"
    else
        echo "⚠️  スキップしました。後で手動で設定してください"
    fi
fi
echo ""

# 4. PM2 でサーバーを再起動
echo "🔄 4. Express サーバーを再起動..."
if command -v pm2 &> /dev/null; then
    echo "PM2 でサーバーを管理します..."
    
    # 既存のプロセスを削除
    pm2 delete rectbot-express 2>/dev/null || echo "既存のプロセスはありません"
    
    # 環境変数を読み込んで起動
    pm2 start server.js --name rectbot-express
    pm2 save
    
    echo "✅ Express サーバーを起動しました"
    echo ""
    
    # ステータス確認
    pm2 status rectbot-express
else
    echo "⚠️  PM2 がインストールされていません"
    echo "直接 Node.js で起動します..."
    pkill -f "node.*server.js" || true
    nohup node server.js > server.log 2>&1 &
    echo "✅ Express サーバーを起動しました"
fi
echo ""

# 5. cloudflared の確認と起動
echo "☁️  5. cloudflared サービスを確認..."
if sudo systemctl is-active --quiet cloudflared; then
    echo "✅ cloudflared は既に起動しています"
else
    echo "⚠️  cloudflared が停止しています。起動します..."
    sudo systemctl start cloudflared
    sudo systemctl enable cloudflared
    echo "✅ cloudflared を起動しました"
fi
echo ""

# 6. 動作確認
echo "🧪 6. 動作確認..."
sleep 3

echo "ポート 3000 のリスニング状態:"
netstat -tuln 2>/dev/null | grep 3000 || ss -tuln | grep 3000
echo ""

echo "Cloudflare Tunnel 接続:"
cloudflared tunnel list | tail -n 1
echo ""

echo "API テスト（認証なし）:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/api/dashboard/recruitment
echo ""

if [ -f .env ] && grep -q "^SERVICE_TOKEN=" .env; then
    SERVICE_TOKEN=$(grep "^SERVICE_TOKEN=" .env | cut -d= -f2 | tr -d '"' | tr -d "'")
    if [ -n "$SERVICE_TOKEN" ]; then
        echo "API テスト（認証あり）:"
        curl -s -H "x-service-token: $SERVICE_TOKEN" -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/api/recruitment/list
    fi
fi
echo ""

echo "======================================"
echo "✅ 修復完了！"
echo ""
echo "次のステップ:"
echo "1. https://dash.rectbot.tech にアクセス"
echo "2. Discord でログイン"
echo "3. エラーが消えているか確認"
echo ""
echo "ログを確認する場合:"
echo "  pm2 logs rectbot-express"
echo ""
echo "問題が続く場合:"
echo "  ./vps_diagnose.sh を実行して詳細を確認"
