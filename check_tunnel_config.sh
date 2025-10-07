#!/bin/bash

echo "=== Cloudflare Tunnel 公開設定確認 ==="
echo ""

# 現在のTunnel設定を確認
echo "1. 現在のTunnel設定:"
cat ~/.cloudflared/config.yml
echo ""

# Tunnelの詳細情報を取得
echo "2. Tunnel情報:"
cloudflared tunnel info 80cbc750-94a4-4b87-b86d-b328b7e76779
echo ""

# Tunnel routeを確認
echo "3. Tunnel routes:"
cloudflared tunnel route dns 80cbc750-94a4-4b87-b86d-b328b7e76779 2>/dev/null || echo "No DNS routes configured"
echo ""

echo "=== 推奨設定 ==="
echo ""
echo "Cloudflare Worker から Tunnel に接続するには、"
echo "Tunnelを public hostname として公開する必要があります。"
echo ""
echo "解決方法1: Cloudflare Zero Trust Dashboard で設定"
echo "  1. https://one.dash.cloudflare.com にアクセス"
echo "  2. Access → Tunnels → express-tunnel を選択"
echo "  3. Public Hostname を追加:"
echo "     - Subdomain: api"
echo "     - Domain: rectbot.tech"
echo "     - Service: http://localhost:3000"
echo ""
echo "解決方法2: Worker と VPS を直接接続（推奨）"
echo "  Worker → Public IP:Port → VPS Express"
echo "  ただし、これにはVPSの Public IP が必要"
echo ""
echo "解決方法3: Cloudflare Argo Tunnel の Public Hostname"
echo "  現在の *.cfargotunnel.com はプライベート"
echo "  Public Hostnameとして api.rectbot.tech を設定"
