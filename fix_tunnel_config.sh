#!/bin/bash

echo "=== Cloudflare Tunnel 設定修正 ==="
echo ""

CONFIG_FILE="/etc/cloudflared/config.yml"

echo "1. 現在の設定をバックアップ:"
sudo cp $CONFIG_FILE ${CONFIG_FILE}.backup
echo "✅ バックアップ作成: ${CONFIG_FILE}.backup"
echo ""

echo "2. 新しい設定を作成:"
sudo tee $CONFIG_FILE > /dev/null <<EOF
tunnel: 80cbc750-94a4-4b87-b86d-b328b7e76779
credentials-file: /home/ubuntu/.cloudflared/80cbc750-94a4-4b87-b86d-b328b7e76779.json

ingress:
  - hostname: api.rectbot.tech
    service: http://localhost:3000
  - service: http_status:404
EOF

echo "✅ 新しい設定を書き込み完了"
echo ""

echo "3. 設定ファイルを確認:"
sudo cat $CONFIG_FILE
echo ""

echo "4. cloudflared サービスを再起動:"
sudo systemctl restart cloudflared
echo "✅ サービス再起動完了"
echo ""

echo "5. サービス状態を確認:"
sudo systemctl status cloudflared --no-pager
echo ""

echo "6. 接続テスト（10秒待機）:"
sleep 10
curl -s https://api.rectbot.tech/api/dashboard/recruitment || echo "まだ接続できません（DNS反映待ち）"
echo ""

echo "=== 設定完了 ==="
echo ""
echo "次のステップ:"
echo "1. DNS反映を待つ（5-15分）"
echo "2. ブラウザで確認: https://dash.rectbot.tech"
echo "3. エラー1102が消えれば成功！"
