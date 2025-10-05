#!/bin/bash
# VPS Express サーバー診断・修復スクリプト

echo "=== Rectbot VPS Express 診断・修復 ==="
echo ""

echo "📋 1. サービス状態確認"
echo "---"
echo "cloudflared:"
sudo systemctl is-active cloudflared
echo ""

echo "Node.js プロセス:"
ps aux | grep -E "node.*(server\.js|index\.js)" | grep -v grep
echo ""

echo "ポート 3000 のリスニング:"
netstat -tuln 2>/dev/null | grep 3000 || ss -tuln | grep 3000
echo ""

echo "📡 2. Cloudflare Tunnel 状態"
echo "---"
cloudflared tunnel list
echo ""

echo "🔧 3. Express API テスト（認証なし）"
echo "---"
echo "ローカルテスト:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/api/dashboard/recruitment
echo ""

echo "🔑 4. SERVICE_TOKEN 確認"
echo "---"
if [ -f ~/rectbot/bot/.env ]; then
    echo ".env ファイルが存在します"
    if grep -q "SERVICE_TOKEN" ~/rectbot/bot/.env; then
        echo "SERVICE_TOKEN が設定されています"
        # 最初の10文字のみ表示（セキュリティのため）
        SERVICE_TOKEN=$(grep "SERVICE_TOKEN" ~/rectbot/bot/.env | cut -d= -f2)
        echo "SERVICE_TOKEN (first 10 chars): ${SERVICE_TOKEN:0:10}..."
    else
        echo "⚠️ SERVICE_TOKEN が .env に設定されていません"
    fi
else
    echo "⚠️ .env ファイルが見つかりません"
fi
echo ""

echo "🔍 5. Express サーバーが使用している環境変数確認"
echo "---"
PM2_PID=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="rectbot-express") | .pid' 2>/dev/null)
if [ -n "$PM2_PID" ]; then
    echo "PM2 で起動された Express サーバーのプロセス: $PM2_PID"
    # 環境変数を確認（セキュリティのため SERVICE_TOKEN は表示しない）
    if [ -f "/proc/$PM2_PID/environ" ]; then
        echo "環境変数が設定されているか:"
        cat /proc/$PM2_PID/environ | tr '\0' '\n' | grep -E "SERVICE_TOKEN|PORT" | sed 's/SERVICE_TOKEN=.*/SERVICE_TOKEN=[HIDDEN]/'
    fi
else
    echo "PM2 プロセスが見つかりません"
fi
echo ""

echo "🧪 6. 認証付き API テスト"
echo "---"
if [ -f ~/rectbot/bot/.env ]; then
    SERVICE_TOKEN=$(grep "SERVICE_TOKEN" ~/rectbot/bot/.env | cut -d= -f2 | tr -d '"' | tr -d "'")
    if [ -n "$SERVICE_TOKEN" ]; then
        echo "SERVICE_TOKEN を使って /api/recruitment/list をテスト:"
        curl -s -H "x-service-token: $SERVICE_TOKEN" -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/api/recruitment/list
    else
        echo "⚠️ SERVICE_TOKEN が空です"
    fi
else
    echo "⚠️ .env ファイルがないためテストをスキップ"
fi
echo ""

echo "🔧 7. 推奨される修正アクション"
echo "---"
echo "問題が見つかった場合の修正方法:"
echo ""
echo "A. cloudflared が停止している場合:"
echo "   sudo systemctl start cloudflared"
echo "   sudo systemctl enable cloudflared"
echo ""
echo "B. Express サーバーが起動していない場合:"
echo "   cd ~/rectbot/bot"
echo "   pm2 restart rectbot-express || pm2 start server.js --name rectbot-express"
echo ""
echo "C. SERVICE_TOKEN が未設定の場合:"
echo "   1. GitHub Secrets の SERVICE_TOKEN を確認"
echo "   2. ~/rectbot/bot/.env に追加:"
echo "      echo 'SERVICE_TOKEN=your-token-here' >> ~/rectbot/bot/.env"
echo "   3. Express サーバーを再起動:"
echo "      pm2 restart rectbot-express"
echo ""
echo "D. 環境変数が反映されていない場合:"
echo "   cd ~/rectbot/bot"
echo "   pm2 delete rectbot-express"
echo "   pm2 start server.js --name rectbot-express"
echo ""

echo "✅ 診断完了"
echo ""
echo "次のステップ:"
echo "1. 上記の出力を確認"
echo "2. 問題がある場合は推奨アクションを実行"
echo "3. ダッシュボードを再度テスト: https://dash.rectbot.tech"
