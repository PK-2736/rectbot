#!/bin/bash

################################################################################
# Cloudflare Tunnel セットアップスクリプト
# 目的: VPS から IPv6 の Supabase に接続するための Cloudflare Tunnel を構築
################################################################################

set -e

echo "================================"
echo "Cloudflare Tunnel セットアップ"
echo "================================"
echo ""

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. cloudflared のインストール
echo -e "${GREEN}[1/5] cloudflared のインストール${NC}"

# アーキテクチャを確認
ARCH=$(uname -m)
echo "Architecture: ${ARCH}"

if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    # ARM64
    CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
elif [ "$ARCH" = "x86_64" ]; then
    # AMD64
    CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
else
    echo -e "${RED}Unsupported architecture: ${ARCH}${NC}"
    exit 1
fi

echo "Downloading cloudflared from: ${CLOUDFLARED_URL}"
wget -O cloudflared "${CLOUDFLARED_URL}"
sudo mv cloudflared /usr/local/bin/
sudo chmod +x /usr/local/bin/cloudflared

# バージョン確認
cloudflared --version

echo ""
echo -e "${GREEN}[2/5] Cloudflare にログイン${NC}"
echo "ブラウザで認証ページが開きます..."
cloudflared tunnel login

echo ""
echo -e "${GREEN}[3/5] Tunnel の作成${NC}"
TUNNEL_NAME="rectbot-supabase-backup"

# 既存の Tunnel を削除（もしあれば）
cloudflared tunnel delete ${TUNNEL_NAME} 2>/dev/null || true

# 新しい Tunnel を作成
cloudflared tunnel create ${TUNNEL_NAME}

# Tunnel ID を取得
TUNNEL_ID=$(cloudflared tunnel list | grep ${TUNNEL_NAME} | awk '{print $1}')
echo "Tunnel ID: ${TUNNEL_ID}"

echo ""
echo -e "${GREEN}[4/5] Tunnel 設定ファイルの作成${NC}"

# 設定ディレクトリを作成
sudo mkdir -p /etc/cloudflared
sudo mkdir -p ~/.cloudflared

# credentials.json を /etc/cloudflared にコピー
sudo cp ~/.cloudflared/${TUNNEL_ID}.json /etc/cloudflared/

# config.yml を作成
cat <<EOF | sudo tee /etc/cloudflared/config.yml
tunnel: ${TUNNEL_ID}
credentials-file: /etc/cloudflared/${TUNNEL_ID}.json

# WARP モードを有効化（IPv6 サポート）
warp-routing:
  enabled: true

# プロトコル設定
protocol: quic

# ログレベル
loglevel: info

# 接続設定
no-autoupdate: true
EOF

echo "✅ 設定ファイルを作成しました: /etc/cloudflared/config.yml"

echo ""
echo -e "${GREEN}[5/5] Tunnel を systemd サービスとして登録${NC}"

# systemd サービスをインストール
sudo cloudflared service install

# サービスを有効化
sudo systemctl enable cloudflared

# サービスを開始
sudo systemctl start cloudflared

# ステータスを確認
sleep 3
sudo systemctl status cloudflared --no-pager

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✅ セットアップ完了！${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${YELLOW}次のステップ:${NC}"
echo ""
echo "1. Cloudflare Zero Trust Dashboard で WARP を有効化:"
echo "   https://one.dash.cloudflare.com/"
echo "   → Networks → Tunnels → ${TUNNEL_NAME}"
echo "   → Configure → Private Network"
echo "   → Add route: db.fkqynvlkwbexbndfxwtf.supabase.co"
echo ""
echo "2. VPS に WARP クライアントをインストール:"
echo "   curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg"
echo "   echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ \$(lsb_release -cs) main\" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list"
echo "   sudo apt-get update && sudo apt-get install cloudflare-warp"
echo "   warp-cli register"
echo "   warp-cli connect"
echo ""
echo "3. バックアップスクリプトをテスト:"
echo "   cd ~/rectbot"
echo "   ./backup_supabase_to_r2.sh"
echo ""
echo -e "${YELLOW}Tunnel 情報:${NC}"
echo "Name: ${TUNNEL_NAME}"
echo "ID: ${TUNNEL_ID}"
echo ""
echo "設定ファイル:"
echo "- /etc/cloudflared/config.yml"
echo "- /etc/cloudflared/${TUNNEL_ID}.json"
echo ""
echo "サービス管理:"
echo "- sudo systemctl status cloudflared"
echo "- sudo systemctl restart cloudflared"
echo "- sudo systemctl stop cloudflared"
echo ""
