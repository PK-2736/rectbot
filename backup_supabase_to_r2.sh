#!/bin/bash

#############################################
# Supabase → Cloudflare R2 バックアップ（OCI上で実行）
# - リポジトリ直下の .env.backup を読み込む
# - backups/ にダンプを作成し、R2 へアップロード
# - KEEP: BACKUP_RETENTION_DAYS を超えた古いバックアップを削除
#############################################

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

ENV_FILE="$REPO_DIR/.env.backup"
BACKUP_DIR="$REPO_DIR/backups"
LOG_FILE="$REPO_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2; }

# 環境変数読み込み（存在すれば）
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# 必須環境変数
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF が未設定}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD が未設定}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID が未設定}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID が未設定}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY が未設定}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME が未設定}"

BACKUP_ENV="${BACKUP_ENV:-prod}"
BACKUP_PREFIX="${BACKUP_PREFIX:-${BACKUP_ENV}/}"

RETENTION_DAYS_DEFAULT=30
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$RETENTION_DAYS_DEFAULT}"

# R2 uses S3-compatible API; default to auto region and path-style addressing
: "${AWS_DEFAULT_REGION:=auto}"
: "${AWS_S3_ADDRESSING_STYLE:=path}"

# 接続情報
SUPABASE_DB_HOST="${SUPABASE_DB_HOST:-db.${SUPABASE_PROJECT_REF}.supabase.co}"
SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-5432}"
SUPABASE_DB_USER="${SUPABASE_DB_USER:-postgres}"
SUPABASE_DB_NAME="${SUPABASE_DB_NAME:-postgres}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="supabase_backup_${TIMESTAMP}.sql"
BACKUP_GZ="${BACKUP_FILE}.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
BACKUP_GZ_PATH="${BACKUP_DIR}/${BACKUP_GZ}"

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

log "=========================================="
log "Supabase バックアップ（OCI）開始"
log "=========================================="
if echo "$SUPABASE_DB_HOST" | grep -qi 'pooler'; then
  SUPABASE_DB_HOST_IPV4="$SUPABASE_DB_HOST"
else
  SUPABASE_DB_HOST_IPV4=$(getent ahostsv4 "$SUPABASE_DB_HOST" 2>/dev/null | head -n 1 | awk '{print $1}')
  if [ -z "$SUPABASE_DB_HOST_IPV4" ]; then
    SUPABASE_DB_HOST_IPV4="$SUPABASE_DB_HOST"
  fi
fi

log "接続先: ${SUPABASE_DB_HOST_IPV4}:${SUPABASE_DB_PORT}"

# 1) pg_dump
log "Step 1: pg_dump 実行中..."
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
if ! command -v pg_dump >/dev/null 2>&1; then
  err "pg_dump が見つかりません（postgresql-client のインストールが必要）"; exit 1;
fi
pg_dump \
  -h "$SUPABASE_DB_HOST_IPV4" \
  -p "$SUPABASE_DB_PORT" \
  -U "$SUPABASE_DB_USER" \
  -d "$SUPABASE_DB_NAME" \
  --no-owner --no-acl --clean --if-exists -F p -f "$BACKUP_PATH"
unset PGPASSWORD
log "✅ ダンプ成功: $BACKUP_PATH"

# 2) 圧縮
log "Step 2: 圧縮中..."
gzip -9 "$BACKUP_PATH"
log "✅ 圧縮成功: $BACKUP_GZ_PATH"

# 3) R2 へアップロード
log "Step 3: R2 へアップロード中... (prefix: ${BACKUP_PREFIX})"
if ! command -v aws >/dev/null 2>&1; then
  err "aws CLI が見つかりません（インストールが必要）"; exit 1;
fi
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
AWS_S3_ADDRESSING_STYLE="$AWS_S3_ADDRESSING_STYLE" \
aws s3 cp "$BACKUP_GZ_PATH" "s3://${R2_BUCKET_NAME}/${BACKUP_PREFIX}${BACKUP_GZ}" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$AWS_DEFAULT_REGION"
log "✅ R2 アップロード成功: s3://${R2_BUCKET_NAME}/${BACKUP_PREFIX}${BACKUP_GZ}"

# 4) R2 古いバックアップ削除
log "Step 4: R2 古いバックアップ削除 (>${RETENTION_DAYS}日)"
CUTOFF_TS=$(date -d "-${RETENTION_DAYS} days" +%s)
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
AWS_S3_ADDRESSING_STYLE="$AWS_S3_ADDRESSING_STYLE" \
aws s3 ls "s3://${R2_BUCKET_NAME}/${BACKUP_PREFIX}" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$AWS_DEFAULT_REGION" | \
  while read -r file_date file_time file_size file_key; do
    [ -z "$file_key" ] && continue
    case "$file_key" in
      supabase_backup_*.sql.gz) ;;
      *) continue ;;
    esac
    file_ts=$(date -d "${file_date} ${file_time}" +%s 2>/dev/null || echo 0)
    if [ "$file_ts" -gt 0 ] && [ "$file_ts" -lt "$CUTOFF_TS" ]; then
      log "  - deleting: ${BACKUP_PREFIX}${file_key}"
      AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
      AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
      AWS_S3_ADDRESSING_STYLE="$AWS_S3_ADDRESSING_STYLE" \
      aws s3 rm "s3://${R2_BUCKET_NAME}/${BACKUP_PREFIX}${file_key}" \
        --endpoint-url "$R2_ENDPOINT" \
        --region "$AWS_DEFAULT_REGION"
    fi
  done
log "✅ R2 整理完了"

# 5) ローカル古いファイル削除
log "Step 5: ローカル古いバックアップ削除 (>${RETENTION_DAYS}日)"
find "$BACKUP_DIR" -type f -name 'supabase_backup_*.sql.gz' -mtime +"${RETENTION_DAYS}" -print -delete | sed 's/^/  - /' || true
log "✅ ローカル整理完了"

# 6) 完了
log "=========================================="
log "✅ バックアップ完了"
log "バックアップ: ${BACKUP_GZ}"
log "R2 バケット: ${R2_BUCKET_NAME}"
log "=========================================="
