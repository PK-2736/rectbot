#!/bin/bash
# 503エラー詳細診断スクリプト

echo "=== RectBot 503 Error Diagnosis ==="
echo ""

echo "1. Cloudflare Tunnel Status"
echo "---"
if command -v cloudflared &> /dev/null; then
    echo "cloudflared version:"
    cloudflared version
    echo ""
    
    echo "Active tunnels:"
    cloudflared tunnel list
    echo ""
    
    echo "cloudflared service status:"
    sudo systemctl status cloudflared --no-pager | head -20
    echo ""
    
    echo "cloudflared process:"
    ps aux | grep cloudflared | grep -v grep
else
    echo "ERROR: cloudflared not installed"
fi
echo ""

echo "2. Express Server Status"
echo "---"
echo "Port 3000 listening:"
netstat -tuln 2>/dev/null | grep ":3000" || ss -tuln | grep ":3000"
echo ""

echo "PM2 processes:"
pm2 list
echo ""

echo "3. Local Connection Test"
echo "---"
echo "Testing Express server locally:"
curl -s http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024" \
  | head -20
echo ""

echo "4. Tunnel Connection Test"
echo "---"
TUNNEL_URL=$(cloudflared tunnel list 2>/dev/null | tail -1 | awk '{print $NF}')
if [ -n "$TUNNEL_URL" ]; then
    echo "Tunnel URL: $TUNNEL_URL"
    echo "Testing recruitment list endpoint:"
    curl -s "$TUNNEL_URL/api/recruitment/list" \
      -H "x-service-token: rectbot-service-token-2024" \
      | head -20
else
    echo "WARNING: Could not detect tunnel URL"
fi
echo ""

echo "5. Recent Logs"
echo "---"
echo "Express server logs:"
pm2 logs rectbot-server --lines 10 --nostream
echo ""

echo "Cloudflared logs:"
sudo journalctl -u cloudflared -n 20 --no-pager
echo ""

echo "=== Diagnosis Complete ==="
echo ""
echo "Action Items:"
echo "1. If cloudflared is not running: sudo systemctl start cloudflared"
echo "2. If Express is not responding: pm2 restart rectbot-server"
echo "3. If port 3000 is not listening: check server.js configuration"
echo "4. Check tunnel URL matches Worker configuration"