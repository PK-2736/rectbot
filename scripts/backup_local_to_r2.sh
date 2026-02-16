#!/bin/bash

#############################################
# ローカル → VPS 経由 Supabase バックアップ
# IPv6 問題の回避策
#############################################

set -e

# ===== 設定 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"
LOG_FILE="${SCRIPT_DIR}/backup.log"
RETENTION_DAYS_DEFAULT=60
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$RETENTION_DAYS_DEFAULT}"

# 環境変数を読み込み
if [ -f "${SCRIPT_DIR}/.env.backup" ]; then
  export $(grep -v '^#' "${SCRIPT_DIR}/.env.backup" | xargs)
fi

# 必須環境変数チェック
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF が設定されていません}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD が設定されていません}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID が設定されていません}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID が設定されていません}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY が設定されていません}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME が設定されていません}"

BACKUP_ENV="${BACKUP_ENV:-prod}"
BACKUP_PREFIX="${BACKUP_PREFIX:-${BACKUP_ENV}/}"

# ===== ログ関数 =====
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="supabase_backup_${TIMESTAMP}.sql"
BACKUP_GZ="supabase_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
BACKUP_GZ_PATH="${BACKUP_DIR}/${BACKUP_GZ}"

log "=========================================="
log "Supabase バックアップ開始（ローカル実行）"
log "=========================================="

# ===== Supabase 接続情報 =====
SUPABASE_DB_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
SUPABASE_DB_PORT=5432
SUPABASE_DB_USER="postgres"
SUPABASE_DB_NAME="postgres"

log "接続先: ${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT}"

# ===== 1. PostgreSQL ダンプ（ローカルから直接） =====
log "Step 1: Supabase データベースをダンプ中..."

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

if pg_dump \
  -h "$SUPABASE_DB_HOST" \
  -p "$SUPABASE_DB_PORT" \
  -U "$SUPABASE_DB_USER" \
  -d "$SUPABASE_DB_NAME" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  -F p \
  -f "$BACKUP_PATH"; then
  log "✅ pg_dump 成功: $BACKUP_PATH"
else
  error "❌ pg_dump 失敗"
  exit 1
fi

unset PGPASSWORD

# ===== 2. 圧縮 =====
log "Step 2: バックアップを圧縮中..."

if gzip -9 "$BACKUP_PATH"; then
  log "✅ 圧縮成功: $BACKUP_GZ_PATH"
else
  error "❌ 圧縮失敗"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_GZ_PATH" | cut -f1)
log "バックアップサイズ: $BACKUP_SIZE"

# ===== 3. VPS に転送 =====
log "Step 3: VPS に転送中..."

VPS_USER="${VPS_USER:-ubuntu}"
VPS_HOST="${VPS_HOST:-your_vps_ip}"

if [ -z "$VPS_HOST" ] || [ "$VPS_HOST" = "your_vps_ip" ]; then
  error "VPS_HOST が設定されていません。.env.backup に追加してください"
  exit 1
fi

if scp "$BACKUP_GZ_PATH" "${VPS_USER}@${VPS_HOST}:~/rectbot/backups/"; then
  log "✅ VPS 転送成功"
else
  error "❌ VPS 転送失敗"
  exit 1
fi

# ===== 4. VPS から R2 にアップロード =====
log "Step 4: VPS から R2 にアップロード中..."

ssh "${VPS_USER}@${VPS_HOST}" << ENDSSH
cd ~/rectbot
export R2_ACCOUNT_ID="${R2_ACCOUNT_ID}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export R2_BUCKET_NAME="${R2_BUCKET_NAME}"
export BACKUP_PREFIX="${BACKUP_PREFIX}"
export BACKUP_RETENTION_DAYS="${RETENTION_DAYS}"

R2_ENDPOINT="https://\${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

AWS_ACCESS_KEY_ID="\${R2_ACCESS_KEY_ID}" \\
AWS_SECRET_ACCESS_KEY="\${R2_SECRET_ACCESS_KEY}" \\
aws s3 cp "backups/${BACKUP_GZ}" "s3://\${R2_BUCKET_NAME}/\${BACKUP_PREFIX}${BACKUP_GZ}" \
  --endpoint-url "\${R2_ENDPOINT}"

# 古いバックアップ削除
CUTOFF_TS=\$(date -d "-\${BACKUP_RETENTION_DAYS} days" +%s)
aws s3 ls "s3://\${R2_BUCKET_NAME}/\${BACKUP_PREFIX}" \
  --endpoint-url "\${R2_ENDPOINT}" | \
  while read -r file_date file_time file_size file_key; do
    [ -z "\${file_key}" ] && continue
    case "\${file_key}" in
      supabase_backup_*.sql.gz) ;;
      *) continue ;;
    esac
    file_ts=\$(date -d "\${file_date} \${file_time}" +%s 2>/dev/null || echo 0)
    if [ "\${file_ts}" -gt 0 ] && [ "\${file_ts}" -lt "\${CUTOFF_TS}" ]; then
      aws s3 rm "s3://\${R2_BUCKET_NAME}/\${BACKUP_PREFIX}\${file_key}" \
        --endpoint-url "\${R2_ENDPOINT}"
    fi
  done

# ローカルバックアップを削除
rm -f "backups/${BACKUP_GZ}"
ENDSSH

log "✅ R2 アップロード成功"

# ===== 5. ローカルバックアップの削除 =====
log "Step 5: ローカルバックアップファイルを削除中..."
rm -f "$BACKUP_GZ_PATH"
log "✅ ローカルファイル削除"

# ===== 6. 完了 =====
log "=========================================="
log "✅ バックアップ完了"
log "バックアップ: ${BACKUP_GZ}"
log "R2 バケット: ${R2_BUCKET_NAME}"
log "=========================================="

exit 0
