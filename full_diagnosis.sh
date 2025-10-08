#!/bin/bash

echo "=== 詳細診断 ==="
echo ""

echo "1. Tunnel設定ファイル:"
sudo cat /etc/cloudflared/config.yml
echo ""

echo "2. cloudflared プロセス:"
ps aux | grep cloudflared | grep -v grep
echo ""

echo "3. cloudflared サービス状態:"
sudo systemctl status cloudflared --no-pager | head -20
echo ""

echo "4. Tunnelの接続状態:"
cloudflared tunnel info 80cbc750-94a4-4b87-b86d-b328b7e76779 2>&1
echo ""

echo "5. PM2プロセス:"
pm2 list
echo ""

echo "6. ポート3000の状態:"
netstat -tlnp | grep :3000
echo ""

echo "7. ローカル接続テスト:"
echo "Request: curl http://localhost:3000/api/recruitment/list -H 'x-service-token: rectbot-service-token-2024'"
curl -s http://localhost:3000/api/recruitment/list -H "x-service-token: rectbot-service-token-2024"
echo ""

echo "8. DNS確認:"
nslookup api.rectbot.tech 1.1.1.1
echo ""

echo "9. api.rectbot.tech 接続テスト:"
echo "Request: curl https://api.rectbot.tech/api/dashboard/recruitment"
curl -v https://api.rectbot.tech/api/dashboard/recruitment 2>&1 | grep -E "< HTTP|Connected|{"
echo ""

echo "10. Tunnel URL 接続テスト:"
echo "Request: curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list -H 'x-service-token: rectbot-service-token-2024'"
curl -s https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list -H "x-service-token: rectbot-service-token-2024"
echo ""

echo "=== 診断完了 ==="
