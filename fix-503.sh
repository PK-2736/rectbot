#!/bin/bash

# 503エラー クイック修復スクリプト
# Cloudflare Tunnel接続問題の修復

echo "🚨 503エラー - VPS サービス修復スクリプト"
echo "========================================"
echo ""

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

VPS_HOST="${1:-your-vps-ip}"
VPS_USER="${2:-ubuntu}"

if [ "$VPS_HOST" = "your-vps-ip" ]; then
    echo -e "${RED}使用方法: ./fix-503.sh VPS_HOST [VPS_USER]${NC}"
    echo "例: ./fix-503.sh 192.168.1.100 ubuntu"
    exit 1
fi

echo "📡 対象VPS: $VPS_USER@$VPS_HOST"
echo ""

# 関数: サービスを再起動
restart_service() {
    local service=$1
    echo -e "${YELLOW}🔄 $service を再起動中...${NC}"
    ssh "$VPS_USER@$VPS_HOST" "sudo systemctl restart $service" 2>/dev/null
    sleep 2
    
    local status=$(ssh "$VPS_USER@$VPS_HOST" "sudo systemctl is-active $service" 2>/dev/null)
    if [ "$status" = "active" ]; then
        echo -e "${GREEN}   ✅ $service: 起動成功${NC}"
        return 0
    else
        echo -e "${RED}   ❌ $service: 起動失敗${NC}"
        return 1
    fi
}

# Step 1: Cloudflare Tunnel の確認と再起動
echo "1️⃣ Cloudflare Tunnel の確認..."
echo "─────────────────────────────"
TUNNEL_STATUS=$(ssh "$VPS_USER@$VPS_HOST" "sudo systemctl is-active cloudflared" 2>/dev/null)

if [ "$TUNNEL_STATUS" != "active" ]; then
    echo -e "${RED}   ❌ Cloudflare Tunnel: 停止中${NC}"
    restart_service "cloudflared"
    
    # Tunnel情報を表示
    echo ""
    echo "   📋 Tunnel情報:"
    ssh "$VPS_USER@$VPS_HOST" "sudo cloudflared tunnel info 2>/dev/null | head -n 5" 2>/dev/null
else
    echo -e "${GREEN}   ✅ Cloudflare Tunnel: 起動中${NC}"
    
    # Tunnel URLを表示
    echo ""
    echo "   📋 Tunnel URL:"
    ssh "$VPS_USER@$VPS_HOST" "sudo cloudflared tunnel info 2>/dev/null | grep -i 'https://'" 2>/dev/null || echo "   （取得できませんでした）"
fi

echo ""

# Step 2: Redis の確認
echo "2️⃣ Redis の確認..."
echo "───────────────────"
REDIS_STATUS=$(ssh "$VPS_USER@$VPS_HOST" "redis-cli ping 2>/dev/null" 2>/dev/null)

if [ "$REDIS_STATUS" != "PONG" ]; then
    echo -e "${RED}   ❌ Redis: 停止中${NC}"
    restart_service "redis"
else
    echo -e "${GREEN}   ✅ Redis: 起動中${NC}"
    
    # 募集データ数を表示
    RECRUIT_COUNT=$(ssh "$VPS_USER@$VPS_HOST" "redis-cli KEYS 'recruit:*' 2>/dev/null | wc -l" 2>/dev/null)
    echo "   📊 募集データ: ${RECRUIT_COUNT}件"
fi

echo ""

# Step 3: Express API の確認
echo "3️⃣ Express API の確認..."
echo "────────────────────────"
PM2_STATUS=$(ssh "$VPS_USER@$VPS_HOST" "pm2 list 2>/dev/null | grep rectbot-server | grep online" 2>/dev/null)

if [ -z "$PM2_STATUS" ]; then
    echo -e "${RED}   ❌ Express API: 停止中${NC}"
    echo -e "${YELLOW}   🔄 再起動中...${NC}"
    ssh "$VPS_USER@$VPS_HOST" "pm2 restart rectbot-server 2>/dev/null || pm2 start ~/rectbot/bot/server.js --name rectbot-server" 2>/dev/null
    sleep 2
    echo -e "${GREEN}   ✅ Express API: 再起動完了${NC}"
else
    echo -e "${GREEN}   ✅ Express API: 起動中${NC}"
fi

# Express APIの応答テスト
echo ""
echo "   🔍 Express API 応答テスト..."
API_TEST=$(ssh "$VPS_USER@$VPS_HOST" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/recruitment/list 2>/dev/null" 2>/dev/null)

if [ "$API_TEST" = "200" ] || [ "$API_TEST" = "401" ]; then
    echo -e "${GREEN}   ✅ Express API: 応答OK (HTTP $API_TEST)${NC}"
else
    echo -e "${RED}   ⚠️  Express API: 応答なし (HTTP $API_TEST)${NC}"
fi

echo ""
echo ""

# Step 4: 自動起動の設定確認
echo "4️⃣ 自動起動の設定..."
echo "──────────────────"
echo "   以下のサービスが自動起動に設定されているか確認します..."

REDIS_ENABLED=$(ssh "$VPS_USER@$VPS_HOST" "sudo systemctl is-enabled redis 2>/dev/null" 2>/dev/null)
CLOUDFLARED_ENABLED=$(ssh "$VPS_USER@$VPS_HOST" "sudo systemctl is-enabled cloudflared 2>/dev/null" 2>/dev/null)

if [ "$REDIS_ENABLED" = "enabled" ]; then
    echo -e "${GREEN}   ✅ Redis: 自動起動 ON${NC}"
else
    echo -e "${YELLOW}   ⚠️  Redis: 自動起動 OFF${NC}"
    echo "      sudo systemctl enable redis"
fi

if [ "$CLOUDFLARED_ENABLED" = "enabled" ]; then
    echo -e "${GREEN}   ✅ Cloudflare Tunnel: 自動起動 ON${NC}"
else
    echo -e "${YELLOW}   ⚠️  Cloudflare Tunnel: 自動起動 OFF${NC}"
    echo "      sudo systemctl enable cloudflared"
fi

echo ""
echo ""

# 結果サマリー
echo "========================================"
echo "📊 修復結果サマリー"
echo "========================================"
echo ""

ERRORS=0

# 最終確認
FINAL_TUNNEL=$(ssh "$VPS_USER@$VPS_HOST" "sudo systemctl is-active cloudflared" 2>/dev/null)
FINAL_REDIS=$(ssh "$VPS_USER@$VPS_HOST" "redis-cli ping 2>/dev/null" 2>/dev/null)
FINAL_EXPRESS=$(ssh "$VPS_USER@$VPS_HOST" "pm2 list 2>/dev/null | grep rectbot-server | grep online" 2>/dev/null)

if [ "$FINAL_TUNNEL" = "active" ]; then
    echo -e "${GREEN}✅ Cloudflare Tunnel: 正常${NC}"
else
    echo -e "${RED}❌ Cloudflare Tunnel: 異常${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ "$FINAL_REDIS" = "PONG" ]; then
    echo -e "${GREEN}✅ Redis: 正常${NC}"
else
    echo -e "${RED}❌ Redis: 異常${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ -n "$FINAL_EXPRESS" ]; then
    echo -e "${GREEN}✅ Express API: 正常${NC}"
else
    echo -e "${RED}❌ Express API: 異常${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 すべてのサービスが正常に起動しました！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "🎯 次のステップ:"
    echo "   1. Worker を再デプロイ:"
    echo "      cd /workspaces/rectbot/backend"
    echo "      wrangler deploy"
    echo ""
    echo "   2. 管理画面でF12を開いてコンソールを確認:"
    echo "      https://dash.rectbot.tech/"
    echo ""
    echo "   3. 5秒待ってデータが表示されることを確認"
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}⚠️  $ERRORS 個のサービスに問題があります${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "🔧 手動で修復してください:"
    echo ""
    echo "   VPSにSSH接続:"
    echo "   ssh $VPS_USER@$VPS_HOST"
    echo ""
    echo "   サービスを確認:"
    echo "   sudo systemctl status cloudflared"
    echo "   redis-cli ping"
    echo "   pm2 list"
    echo ""
    echo "   ログを確認:"
    echo "   sudo journalctl -u cloudflared -n 50"
    echo "   pm2 logs rectbot-server --lines 50"
fi

echo ""
echo "========================================"
