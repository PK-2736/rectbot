#!/bin/bash

echo "=== VPS Express サーバー診断 ==="
echo ""

# 1. PM2プロセス確認
echo "1. PM2プロセス状態:"
pm2 list

echo ""
echo "2. Expressサーバーのポート確認:"
netstat -tlnp | grep :3000 || echo "ポート3000が見つかりません"

echo ""
echo "3. ローカル接続テスト:"
curl -s http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024" || echo "ローカル接続失敗"

echo ""
echo "4. Cloudflare Tunnel状態:"
sudo systemctl status cloudflared || echo "Cloudflared サービス確認失敗"

echo ""
echo "5. Tunnel接続確認:"
curl -s https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024" || echo "Tunnel経由接続失敗"

echo ""
echo "6. PM2ログ確認（最新20行）:"
pm2 logs rectbot-server --lines 20 --nostream

echo ""
echo "=== 診断完了 ==="
echo ""
echo "次のステップ:"
echo "1. PM2プロセスが停止している場合: pm2 restart all"
echo "2. Cloudflare Tunnelが停止している場合: sudo systemctl restart cloudflared"
echo "3. ポート3000が使用中でない場合: cd ~/rectbot/bot && pm2 restart pm2-server.config.js"
