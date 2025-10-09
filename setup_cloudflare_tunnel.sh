#!/bin/bash

################################################################################
# Cloudflare Tunnel - Supabase 専用 Tunnel 作成スクリプト
# 目的: Supabase バックアップ専用の新しい Cloudflare Tunnel を作成
################################################################################

set -e

echo "========================================================"
echo "Cloudflare Tunnel - Supabase 専用 Tunnel セットアップ"
echo "========================================================"
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
TUNNEL_NAME="supabase-backup-tunnel"

echo -e "${BLUE}📋 新しい Tunnel を作成します（既存の express-tunnel とは別）${NC}"
echo ""

# 1. cloudflared がインストールされているか確認
echo -e "${GREEN}[1/5] cloudflared の確認${NC}"

if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared がインストールされていません${NC}"
    exit 1
fi

echo "✅ cloudflared がインストール済み"
cloudflared --version

echo ""
echo -e "${GREEN}[2/5] 既存の Tunnel を確認${NC}"

# Tunnel 一覧を表示
echo "現在の Tunnel 一覧:"
cloudflared tunnel list

echo ""
echo -e "${GREEN}[3/5] 新しい Tunnel を作成${NC}"

# 既存の同名 Tunnel を削除（もしあれば）
cloudflared tunnel delete ${TUNNEL_NAME} 2>/dev/null || true

# 新しい Tunnel を作成
echo "Tunnel 名: ${TUNNEL_NAME}"
cloudflared tunnel create ${TUNNEL_NAME}

# Tunnel ID を取得
TUNNEL_ID=$(cloudflared tunnel list | grep ${TUNNEL_NAME} | awk '{print $1}')
echo "✅ Tunnel ID: ${TUNNEL_ID}"

echo ""
echo -e "${GREEN}[4/5] Tunnel 設定ファイルの作成${NC}"

# 設定ディレクトリを作成
sudo mkdir -p /etc/cloudflared-supabase
sudo mkdir -p ~/.cloudflared

# credentials.json をコピー
sudo cp ~/.cloudflared/${TUNNEL_ID}.json /etc/cloudflared-supabase/

# config.yml を作成（Supabase 専用）
CONFIG_FILE="/etc/cloudflared-supabase/config.yml"

cat <<EOF | sudo tee ${CONFIG_FILE}
tunnel: ${TUNNEL_ID}
credentials-file: /etc/cloudflared-supabase/${TUNNEL_ID}.json

# WARP モードを有効化（IPv6 サポート）
warp-routing:
  enabled: true

# ingress ルール（ダミー）
ingress:
  - service: http_status:404

# プロトコル設定
protocol: quic

# ログレベル
loglevel: info

# 接続設定
no-autoupdate: true
EOF

echo "✅ 設定ファイルを作成しました: ${CONFIG_FILE}"
echo ""
echo "設定内容:"
sudo cat ${CONFIG_FILE}

echo ""
echo -e "${GREEN}[5/5] systemd サービスの作成${NC}"

# Supabase 専用の systemd サービスファイルを作成
SERVICE_FILE="/etc/systemd/system/cloudflared-supabase.service"

cat <<EOF | sudo tee ${SERVICE_FILE}
[Unit]
Description=Cloudflare Tunnel for Supabase Backup
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --config ${CONFIG_FILE} run
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

echo "✅ サービスファイルを作成しました: ${SERVICE_FILE}"

# systemd をリロード
sudo systemctl daemon-reload

# サービスを有効化
sudo systemctl enable cloudflared-supabase

# サービスを開始
sudo systemctl start cloudflared-supabase

# ステータスを確認
sleep 3
echo ""
echo "サービスステータス:"
sudo systemctl status cloudflared-supabase --no-pager || true

echo ""
echo -e "${GREEN}========================================================"
echo -e "✅ セットアップ完了！"
echo -e "========================================================${NC}"
echo ""
echo -e "${YELLOW}📝 次のステップ:${NC}"
echo ""
echo -e "${BLUE}1. Cloudflare Zero Trust Dashboard で Private Network を追加:${NC}"
echo "   https://one.dash.cloudflare.com/"
echo ""
echo "   ① Networks → Tunnels → ${TUNNEL_NAME} を選択"
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
echo -e "${BLUE}2. VPS に WARP クライアントをインストール:${NC}"
echo "   curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg"
echo "   echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ \$(lsb_release -cs) main\" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list"
echo "   sudo apt-get update && sudo apt-get install cloudflare-warp"
echo "   warp-cli registration new"
echo "   warp-cli connect"
echo ""
echo -e "${BLUE}3. 接続テスト:${NC}"
echo "   ping6 -c 3 ${SUPABASE_HOST}"
echo ""
echo "   成功すれば以下のような出力が表示されます:"
echo "   64 bytes from ${SUPABASE_IPV6}: icmp_seq=1 ttl=64 time=X.XX ms"
echo ""
echo -e "${BLUE}4. バックアップスクリプトをテスト:${NC}"
echo "   cd ~/rectbot"
echo "   ./backup_supabase_to_r2.sh"
echo ""
echo -e "${GREEN}========================================================${NC}"
echo -e "${GREEN}Tunnel 情報:${NC}"
echo -e "${GREEN}========================================================${NC}"
echo "Name: ${TUNNEL_NAME}"
echo "ID: ${TUNNEL_ID}"
echo "Config: ${CONFIG_FILE}"
echo "Service: cloudflared-supabase.service"
echo ""
echo -e "${GREEN}Supabase 接続情報:${NC}"
echo "Host: ${SUPABASE_HOST}"
echo "IPv6: ${SUPABASE_IPV6}"
echo "Subnet: ${SUPABASE_SUBNET}"
echo "Port: 5432"
echo ""
echo -e "${GREEN}サービス管理コマンド:${NC}"
echo "- sudo systemctl status cloudflared-supabase"
echo "- sudo systemctl restart cloudflared-supabase"
echo "- sudo systemctl stop cloudflared-supabase"
echo "- sudo systemctl start cloudflared-supabase"
echo "- sudo journalctl -u cloudflared-supabase -f"
echo ""
echo -e "${YELLOW}📌 重要: 既存の express-tunnel は影響を受けません${NC}"
echo "   express-tunnel: backend.rectbot.tech 向け"
echo "   ${TUNNEL_NAME}: Supabase IPv6 接続専用"
echo ""


