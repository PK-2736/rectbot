#!/bin/bash

################################################################################
# Cloudflare Tunnel - Supabase Private Network 追加スクリプト
# 目的: 既存の Cloudflare Tunnel に Supabase へのルートを追加
################################################################################

set -e

echo "=================================================="
echo "Cloudflare Tunnel - Supabase ルート追加"
echo "=================================================="
echo ""

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Supabase の情報
SUPABASE_HOST="db.fkqynvlkwbexbndfxwtf.supabase.co"
SUPABASE_IPV6="2406:da14:271:9901:acf1:9453:83e3:d1d0"
SUPABASE_SUBNET="2406:da14:271:9901::/64"

echo -e "${BLUE}📋 既存の Cloudflare Tunnel を使用します${NC}"
echo ""

# 1. cloudflared がインストールされているか確認
echo -e "${GREEN}[1/3] cloudflared の確認${NC}"

if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared がインストールされていません${NC}"
    echo "既存の Tunnel を使用しているはずですが、cloudflared コマンドが見つかりません"
    exit 1
fi

echo "✅ cloudflared がインストール済み"
cloudflared --version

echo ""
echo -e "${GREEN}[2/3] 既存の Tunnel を確認${NC}"

# Tunnel 一覧を表示
echo "現在の Tunnel 一覧:"
cloudflared tunnel list

echo ""
echo -e "${YELLOW}既存の Tunnel に WARP Routing を追加します${NC}"
echo ""

# 2. 既存の config.yml に warp-routing を追加
echo -e "${GREEN}[3/3] 既存の設定ファイルを確認${NC}"

CONFIG_FILE="/etc/cloudflared/config.yml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ 設定ファイルが見つかりません: ${CONFIG_FILE}${NC}"
    echo "既存の Tunnel の設定ファイルの場所を確認してください"
    exit 1
fi

echo "✅ 設定ファイルを確認: ${CONFIG_FILE}"
echo ""
echo "現在の設定:"
sudo cat "$CONFIG_FILE"
echo ""

# warp-routing が既に有効か確認
if sudo grep -q "warp-routing" "$CONFIG_FILE"; then
    echo -e "${YELLOW}⚠️  warp-routing は既に設定されています${NC}"
else
    echo -e "${YELLOW}warp-routing が設定されていません${NC}"
    echo "手動で設定ファイルに追加する必要があります"
    echo ""
    echo "以下を ${CONFIG_FILE} に追加してください:"
    echo ""
    echo -e "${BLUE}# WARP モードを有効化（IPv6 サポート）"
    echo "warp-routing:"
    echo -e "  enabled: true${NC}"
    echo ""
fi

echo ""
echo -e "${GREEN}=================================================="
echo -e "✅ 確認完了！"
echo -e "==================================================${NC}"
echo ""
echo -e "${YELLOW}📝 次のステップ:${NC}"
echo ""
echo -e "${BLUE}1. Cloudflare Zero Trust Dashboard で Private Network を追加:${NC}"
echo "   https://one.dash.cloudflare.com/"
echo ""
echo "   ① Networks → Tunnels → [既存の Tunnel 名] を選択"
echo "   ② Configure タブ → Private Networks セクション"
echo "   ③ Add a private network をクリック"
echo ""
echo -e "${BLUE}   【方法1】サブネット全体を追加（推奨）:${NC}"
echo "      CIDR: ${SUPABASE_SUBNET}"
echo "      Description: Supabase Database Network"
echo ""
echo -e "${BLUE}   【方法2】特定のホストのみ追加:${NC}"
echo "      Type: Single Host"
echo "      Hostname: ${SUPABASE_HOST}"
echo "      IP Address: ${SUPABASE_IPV6}"
echo ""
echo -e "${BLUE}2. config.yml に warp-routing を追加（まだの場合）:${NC}"
echo "   sudo nano ${CONFIG_FILE}"
echo ""
echo "   以下を追加:"
echo "   ---"
echo "   warp-routing:"
echo "     enabled: true"
echo "   ---"
echo ""
echo -e "${BLUE}3. cloudflared サービスを再起動:${NC}"
echo "   sudo systemctl restart cloudflared"
echo "   sudo systemctl status cloudflared"
echo ""
echo -e "${BLUE}4. VPS に WARP クライアントをインストール:${NC}"
echo "   curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg"
echo "   echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ \$(lsb_release -cs) main\" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list"
echo "   sudo apt-get update && sudo apt-get install cloudflare-warp"
echo "   warp-cli register"
echo "   warp-cli connect"
echo ""
echo -e "${BLUE}5. 接続テスト:${NC}"
echo "   ping6 -c 3 ${SUPABASE_HOST}"
echo ""
echo "   成功すれば以下のような出力が表示されます:"
echo "   64 bytes from ${SUPABASE_IPV6}: icmp_seq=1 ttl=64 time=X.XX ms"
echo ""
echo -e "${BLUE}6. バックアップスクリプトをテスト:${NC}"
echo "   cd ~/rectbot"
echo "   ./backup_supabase_to_r2.sh"
echo ""
echo -e "${GREEN}=================================================="
echo -e "Supabase 接続情報:"
echo -e "==================================================${NC}"
echo "Host: ${SUPABASE_HOST}"
echo "IPv6: ${SUPABASE_IPV6}"
echo "Subnet: ${SUPABASE_SUBNET}"
echo "Port: 5432"
echo ""

