#!/bin/bash

#############################################
# バックアップシステム VPS デプロイスクリプト
# ローカルから VPS にファイルを転送してセットアップ
#############################################

set -e

# ===== 設定 =====
VPS_USER="ubuntu"
VPS_HOST="your_vps_ip_here"  # VPS の IP アドレスに変更
VPS_DIR="/home/ubuntu/rectbot"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "バックアップシステム VPS デプロイ"
echo "=========================================="

# ===== 1. ファイルを VPS に転送 =====
echo ""
echo "Step 1: ファイルを VPS に転送中..."

scp "${LOCAL_DIR}/backup_supabase_to_r2.sh" "${VPS_USER}@${VPS_HOST}:${VPS_DIR}/"
scp "${LOCAL_DIR}/.env.backup.example" "${VPS_USER}@${VPS_HOST}:${VPS_DIR}/"

echo "✅ ファイル転送完了"

# ===== 2. VPS 上でセットアップ =====
echo ""
echo "Step 2: VPS 上でセットアップ中..."

ssh "${VPS_USER}@${VPS_HOST}" << 'ENDSSH'
cd ~/rectbot

# 権限設定
chmod +x backup_supabase_to_r2.sh

# バックアップディレクトリ作成
mkdir -p backups

# PostgreSQL クライアントと AWS CLI をインストール
echo "必要なパッケージをインストール中..."
sudo apt update
sudo apt install -y postgresql-client awscli

# インストール確認
echo ""
echo "=========================================="
echo "インストール確認"
echo "=========================================="
pg_dump --version
aws --version

echo ""
echo "=========================================="
echo "✅ VPS セットアップ完了"
echo "=========================================="
echo ""
echo "次のステップ:"
echo "1. VPS にログイン: ssh ubuntu@$(hostname -I | awk '{print $1}')"
echo "2. 環境変数を設定: nano ~/rectbot/.env.backup"
echo "3. テスト実行: cd ~/rectbot && ./backup_supabase_to_r2.sh"
echo "4. Cron ジョブ設定: crontab -e"
echo ""
echo "詳細は BACKUP_SETUP_GUIDE.md を参照してください"
echo "=========================================="
ENDSSH

echo ""
echo "✅ デプロイ完了"

exit 0
