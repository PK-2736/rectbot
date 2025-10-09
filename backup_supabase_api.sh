#!/bin/bash

#############################################
# Supabase Management API 経由でバックアップ
# IPv6 不要の代替方法
#############################################

set -e

# ===== 設定 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"
LOG_FILE="${SCRIPT_DIR}/backup.log"

# 環境変数を読み込み
if [ -f "${SCRIPT_DIR}/.env.backup" ]; then
  export $(grep -v '^#' "${SCRIPT_DIR}/.env.backup" | xargs)
fi

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
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

log "=========================================="
log "Supabase API バックアップ（IPv6 不要）"
log "=========================================="

# Supabase にはダンプ用の直接 API がないため、
# 代替案として supabase-js や REST API を使用してデータをエクスポート

log "⚠️ この方法は開発中です"
log "推奨: VPS で IPv6 を有効化して pg_dump を使用してください"

exit 1
