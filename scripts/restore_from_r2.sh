#!/bin/bash

#############################################
# Cloudflare R2 → Supabase 復元スクリプト
# バックアップから Supabase データベースを復元
#############################################

set -e

# ===== 設定 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"
LOG_FILE="${SCRIPT_DIR}/restore.log"

# 環境変数を読み込み
if [ -f "${SCRIPT_DIR}/.env.backup" ]; then
  export $(grep -v '^#' "${SCRIPT_DIR}/.env.backup" | xargs)
fi

# R2 uses S3-compatible API; default to auto region and path-style addressing
: "${AWS_DEFAULT_REGION:=auto}"
: "${AWS_S3_ADDRESSING_STYLE:=path}"

# 必須環境変数チェック
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF が設定されていません}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD が設定されていません}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID が設定されていません}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID が設定されていません}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY が設定されていません}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME が設定されていません}"

BACKUP_ENV="${BACKUP_ENV:-prod}"
BACKUP_PREFIX="${BACKUP_PREFIX:-${BACKUP_ENV}/}"

# ===== Supabase 接続情報を構築 =====
# Direct Connection (port 5432) を使用
SUPABASE_DB_HOST="${SUPABASE_DB_HOST:-db.${SUPABASE_PROJECT_REF}.supabase.co}"
SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-5432}"
SUPABASE_DB_USER="${SUPABASE_DB_USER:-postgres}"
SUPABASE_DB_NAME="${SUPABASE_DB_NAME:-postgres}"

# ===== ログ関数 =====
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

# ===== バックアップディレクトリ作成 =====
mkdir -p "$BACKUP_DIR"

# ===== R2 エンドポイント =====
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

log "=========================================="
log "Supabase 復元ツール"
log "=========================================="

# ===== 1. 利用可能なバックアップをリスト =====
log ""
log "Step 1: R2 から利用可能なバックアップを取得中... (prefix: ${BACKUP_PREFIX})"

BACKUPS=$(AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
          AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
          AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
          AWS_S3_ADDRESSING_STYLE="$AWS_S3_ADDRESSING_STYLE" \
          aws s3 ls "s3://${R2_BUCKET_NAME}/${BACKUP_PREFIX}" \
          --endpoint-url "$R2_ENDPOINT" \
          --region "$AWS_DEFAULT_REGION" | \
          grep 'supabase_backup_' | \
          awk '{print $4}' | \
          sort -r)

if [ -z "$BACKUPS" ]; then
  error "❌ バックアップが見つかりません"
  exit 1
fi

log "利用可能なバックアップ:"
echo ""
COUNT=1
declare -a BACKUP_ARRAY
for BACKUP in $BACKUPS; do
  echo "  [$COUNT] $BACKUP"
  BACKUP_ARRAY[$COUNT]="$BACKUP"
  COUNT=$((COUNT + 1))
done
echo ""

# ===== 2. バックアップを選択 =====
if [ -n "$1" ]; then
  # コマンドライン引数で指定
  SELECTED_INDEX="$1"
else
  # インタラクティブに選択
  read -p "復元するバックアップの番号を入力してください (1-$((COUNT-1))): " SELECTED_INDEX
fi

if [ -z "$SELECTED_INDEX" ] || [ "$SELECTED_INDEX" -lt 1 ] || [ "$SELECTED_INDEX" -ge "$COUNT" ]; then
  error "❌ 無効な選択です"
  exit 1
fi

SELECTED_BACKUP="${BACKUP_ARRAY[$SELECTED_INDEX]}"
log "選択されたバックアップ: $SELECTED_BACKUP"

# ===== 3. 確認プロンプト =====
echo ""
echo "⚠️  警告: このバックアップで Supabase データベースを上書きします"
echo "現在のデータは失われます！"
echo ""
read -p "続行しますか? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  log "復元をキャンセルしました"
  exit 0
fi

# ===== 4. R2 からダウンロード =====
log ""
log "Step 2: R2 からバックアップをダウンロード中..."

DOWNLOAD_PATH="${BACKUP_DIR}/${SELECTED_BACKUP}"

if AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
  AWS_S3_ADDRESSING_STYLE="$AWS_S3_ADDRESSING_STYLE" \
  aws s3 cp "s3://${R2_BUCKET_NAME}/${BACKUP_PREFIX}${SELECTED_BACKUP}" "$DOWNLOAD_PATH" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$AWS_DEFAULT_REGION"; then
  log "✅ ダウンロード成功: $DOWNLOAD_PATH"
else
  error "❌ ダウンロード失敗"
  exit 1
fi

# ===== 5. 解凍 =====
log "Step 3: バックアップを解凍中..."

SQL_FILE="${DOWNLOAD_PATH%.gz}"

if gunzip -f "$DOWNLOAD_PATH"; then
  log "✅ 解凍成功: $SQL_FILE"
else
  error "❌ 解凍失敗"
  exit 1
fi

# ===== 6. Supabase に復元 =====
log "Step 4: Supabase データベースに復元中..."

# IPv4 アドレスを取得（IPv6 問題を回避）
log "Resolving IPv4 address..."
SUPABASE_DB_HOST_IPV4=$(getent ahostsv4 "$SUPABASE_DB_HOST" | head -n 1 | awk '{print $1}')

if [ -z "$SUPABASE_DB_HOST_IPV4" ]; then
  error "❌ IPv4 アドレスの解決に失敗しました"
  log "ホスト名で接続を試みます..."
  SUPABASE_DB_HOST_IPV4="$SUPABASE_DB_HOST"
else
  log "IPv4 アドレス: $SUPABASE_DB_HOST_IPV4"
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

if psql \
  -h "$SUPABASE_DB_HOST_IPV4" \
  -p "$SUPABASE_DB_PORT" \
  -U "$SUPABASE_DB_USER" \
  -d "$SUPABASE_DB_NAME" \
  -f "$SQL_FILE"; then
  log "✅ 復元成功"
else
  error "❌ 復元失敗"
  unset PGPASSWORD
  exit 1
fi

unset PGPASSWORD

# ===== 7. クリーンアップ =====
log "Step 5: 一時ファイルを削除中..."
rm -f "$SQL_FILE"
log "✅ クリーンアップ完了"

# ===== 8. 完了 =====
log ""
log "=========================================="
log "✅ 復元完了"
log "バックアップ: ${SELECTED_BACKUP}"
log "データベース: ${SUPABASE_DB_HOST}/${SUPABASE_DB_NAME}"
log "=========================================="

exit 0
