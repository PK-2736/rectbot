#!/bin/bash

#############################################
# Supabase (BaaS) → Cloudflare R2 Backup
# 毎日実行してデータベースをバックアップ
#############################################

set -e  # エラー時に停止

# ===== 設定 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"
LOG_FILE="${SCRIPT_DIR}/backup.log"
RETENTION_DAYS=30  # 保持期間（日数）

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

# ===== ログ関数 =====
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

# ===== バックアップディレクトリ作成 =====
mkdir -p "$BACKUP_DIR"

# ===== バックアップファイル名 =====
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="supabase_backup_${TIMESTAMP}.sql"
BACKUP_GZ="supabase_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
BACKUP_GZ_PATH="${BACKUP_DIR}/${BACKUP_GZ}"

log "=========================================="
log "Supabase バックアップ開始"
log "=========================================="

# ===== 1. Supabase CLI でダンプ =====
log "接続先: Project Ref: ${SUPABASE_PROJECT_REF} (Supabase CLI経由)"

# ===== 2. Supabase CLI でデータベースダンプ =====
log "Step 1: Supabase データベースをダンプ中 (Supabase CLI経由)..."

# Supabase CLIでダンプ実行
# --db-url で直接接続情報を指定
# Supabase CLIはDockerを使用してIPv6接続を処理
DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"

if supabase db dump --db-url "$DB_URL" -f "$BACKUP_PATH" 2>&1 | tee -a "$LOG_FILE"; then
  log "✅ Supabase CLI dump 成功: $BACKUP_PATH"
  
  # ファイルサイズを確認
  if [ -f "$BACKUP_PATH" ] && [ -s "$BACKUP_PATH" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
    log "📦 バックアップサイズ: $BACKUP_SIZE"
  else
    error "❌ バックアップファイルが空または存在しません"
    exit 1
  fi
else
  error "❌ Supabase CLI dump 失敗"
  error "プロジェクト: ${SUPABASE_PROJECT_REF}"
  exit 1
fi
fi

unset PGPASSWORD
unset PGHOSTADDR

# ===== 2. 圧縮 =====
log "Step 2: バックアップを圧縮中..."

if gzip -9 "$BACKUP_PATH"; then
  log "✅ 圧縮成功: $BACKUP_GZ_PATH"
else
  error "❌ 圧縮失敗"
  exit 1
fi

# ファイルサイズ確認
BACKUP_SIZE=$(du -h "$BACKUP_GZ_PATH" | cut -f1)
log "バックアップサイズ: $BACKUP_SIZE"

# ===== 3. R2 にアップロード =====
log "Step 3: Cloudflare R2 にアップロード中..."

# R2 エンドポイント (S3互換)
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# aws-cli (s3 互換コマンド) でアップロード
if command -v aws &> /dev/null; then
  if AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
     AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
     aws s3 cp "$BACKUP_GZ_PATH" "s3://${R2_BUCKET_NAME}/${BACKUP_GZ}" \
     --endpoint-url "$R2_ENDPOINT"; then
    log "✅ R2 アップロード成功: s3://${R2_BUCKET_NAME}/${BACKUP_GZ}"
  else
    error "❌ R2 アップロード失敗"
    exit 1
  fi
else
  error "❌ aws-cli がインストールされていません"
  error "インストール: sudo apt install awscli"
  exit 1
fi

# ===== 4. ローカルバックアップの削除 =====
log "Step 4: ローカルバックアップファイルを削除中..."
rm -f "$BACKUP_GZ_PATH"
log "✅ ローカルファイル削除: $BACKUP_GZ_PATH"

# ===== 5. 古いバックアップの削除 (R2) =====
log "Step 5: ${RETENTION_DAYS}日以前のバックアップを削除中..."

CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

# R2 内のバックアップをリスト
OLD_BACKUPS=$(AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
              AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
              aws s3 ls "s3://${R2_BUCKET_NAME}/" \
              --endpoint-url "$R2_ENDPOINT" | \
              grep 'supabase_backup_' | \
              awk '{print $4}')

DELETED_COUNT=0
for BACKUP in $OLD_BACKUPS; do
  # ファイル名から日付を抽出 (supabase_backup_YYYYMMDD_HHMMSS.sql.gz)
  BACKUP_DATE=$(echo "$BACKUP" | sed -n 's/supabase_backup_\([0-9]\{8\}\)_.*/\1/p')
  
  if [ -n "$BACKUP_DATE" ] && [ "$BACKUP_DATE" -lt "$CUTOFF_DATE" ]; then
    log "古いバックアップを削除: $BACKUP (日付: $BACKUP_DATE)"
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3 rm "s3://${R2_BUCKET_NAME}/${BACKUP}" \
    --endpoint-url "$R2_ENDPOINT"
    DELETED_COUNT=$((DELETED_COUNT + 1))
  fi
done

log "✅ ${DELETED_COUNT}個の古いバックアップを削除しました"

# ===== 6. 完了 =====
log "=========================================="
log "✅ バックアップ完了"
log "バックアップ: ${BACKUP_GZ}"
log "R2 バケット: ${R2_BUCKET_NAME}"
log "=========================================="

exit 0
