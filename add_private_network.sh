#!/bin/bash

################################################################################
# Cloudflare Tunnel - Private Network 追加スクリプト（API版）
# 目的: cloudflared コマンドまたは API で Private Network を追加
################################################################################

set -e

echo "=========================================================="
echo "Cloudflare Tunnel - Private Network 追加"
echo "=========================================================="
echo ""

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Supabase の情報
SUPABASE_SUBNET="2406:da14:271:9901::/64"
TUNNEL_NAME="supabase-backup-tunnel"

echo -e "${BLUE}📋 Tunnel に Private Network を追加します${NC}"
echo ""

# 1. Tunnel ID を取得
echo -e "${GREEN}[1/3] Tunnel ID を取得${NC}"

if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared がインストールされていません${NC}"
    exit 1
fi

TUNNEL_ID=$(cloudflared tunnel list | grep ${TUNNEL_NAME} | awk '{print $1}')

if [ -z "$TUNNEL_ID" ]; then
    echo -e "${RED}❌ Tunnel '${TUNNEL_NAME}' が見つかりません${NC}"
    echo "先に ./setup_cloudflare_tunnel.sh を実行してください"
    exit 1
fi

echo "✅ Tunnel ID: ${TUNNEL_ID}"

echo ""
echo -e "${GREEN}[2/3] cloudflared コマンドで Private Network を追加${NC}"

# cloudflared tunnel route ip add を使用
echo "コマンド: cloudflared tunnel route ip add ${SUPABASE_SUBNET} ${TUNNEL_ID}"

if cloudflared tunnel route ip add ${SUPABASE_SUBNET} ${TUNNEL_ID}; then
    echo -e "${GREEN}✅ Private Network を追加しました${NC}"
else
    echo -e "${YELLOW}⚠️  既に追加されている可能性があります${NC}"
fi

echo ""
echo -e "${GREEN}[3/3] 追加された Private Network を確認${NC}"

cloudflared tunnel route ip show ${TUNNEL_ID}

echo ""
echo -e "${GREEN}=========================================================="
echo -e "✅ 完了！"
echo -e "==========================================================${NC}"
echo ""
echo -e "${YELLOW}📝 次のステップ:${NC}"
echo ""
echo "1. WARP クライアントをインストール（まだの場合）:"
echo "   curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg"
echo "   echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ \$(lsb_release -cs) main\" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list"
echo "   sudo apt-get update && sudo apt-get install cloudflare-warp"
echo "   warp-cli registration new"
echo "   warp-cli connect"
echo ""
echo "2. 接続テスト:"
echo "   ping6 -c 3 db.fkqynvlkwbexbndfxwtf.supabase.co"
echo ""
echo "3. バックアップスクリプトをテスト:"
echo "   cd ~/rectbot"
echo "   ./backup_supabase_to_r2.sh"
echo ""
