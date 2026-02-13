#!/bin/bash

#############################################
# Cloudflare R2 復元スクリプトのテスト
# 実際の復元は行わず、動作確認のみ実施
#############################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/test_restore.log"

# ===== ログ関数 =====
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

success() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $*" | tee -a "$LOG_FILE"
}

# ===== 環境変数を読み込み =====
if [ -f "${SCRIPT_DIR}/../.env.backup" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "${SCRIPT_DIR}/../.env.backup" | xargs)
elif [ -f "${SCRIPT_DIR}/.env.backup" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "${SCRIPT_DIR}/.env.backup" | xargs)
fi

# R2 uses S3-compatible API; default to auto region and path-style addressing
: "${AWS_DEFAULT_REGION:=auto}"
: "${AWS_S3_ADDRESSING_STYLE:=path}"

log "=========================================="
log "R2 復元スクリプトのテスト"
log "=========================================="
log ""

# ===== テスト1: 必須環境変数チェック =====
log "Test 1: 必須環境変数の存在確認..."
MISSING_VARS=()

check_var() {
  if [ -z "${!1}" ]; then
    MISSING_VARS+=("$1")
    error "  ❌ $1 が設定されていません"
    return 1
  else
    log "  ✅ $1 が設定されています"
    return 0
  fi
}

check_var "SUPABASE_PROJECT_REF"
check_var "SUPABASE_DB_PASSWORD"
check_var "R2_ACCOUNT_ID"
check_var "R2_ACCESS_KEY_ID"
check_var "R2_SECRET_ACCESS_KEY"
check_var "R2_BUCKET_NAME"

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  error "以下の環境変数が不足しています: ${MISSING_VARS[*]}"
  error "Test 1: FAILED"
  exit 1
fi

success "Test 1: PASSED - すべての必須環境変数が設定されています"
log ""

# ===== テスト2: AWS CLI の存在確認 =====
log "Test 2: AWS CLI の存在確認..."
if command -v aws &> /dev/null; then
  AWS_VERSION=$(aws --version 2>&1 | head -n 1)
  success "Test 2: PASSED - AWS CLI が利用可能です ($AWS_VERSION)"
else
  error "Test 2: FAILED - AWS CLI が見つかりません"
  exit 1
fi
log ""

# ===== テスト3: PostgreSQL クライアントの存在確認 =====
log "Test 3: PostgreSQL クライアント (psql) の存在確認..."
if command -v psql &> /dev/null; then
  PSQL_VERSION=$(psql --version)
  success "Test 3: PASSED - psql が利用可能です ($PSQL_VERSION)"
else
  error "Test 3: FAILED - psql が見つかりません"
  exit 1
fi
log ""

# ===== テスト4: R2 バケットへの接続テスト =====
log "Test 4: Cloudflare R2 バケットへの接続テスト..."
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

if AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
  AWS_S3_ADDRESSING_STYLE="$AWS_S3_ADDRESSING_STYLE" \
  aws s3 ls "s3://${R2_BUCKET_NAME}/" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$AWS_DEFAULT_REGION" &> /dev/null; then
  success "Test 4: PASSED - R2 バケットに接続できます"
else
  error "Test 4: FAILED - R2 バケットへの接続に失敗しました"
  error "  エンドポイント: $R2_ENDPOINT"
  error "  バケット名: $R2_BUCKET_NAME"
  exit 1
fi
log ""

# ===== テスト5: R2 内のバックアップファイル確認 =====
log "Test 5: R2 内のバックアップファイルの存在確認..."

BACKUPS=$(AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
          AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
          AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
          AWS_S3_ADDRESSING_STYLE="$AWS_S3_ADDRESSING_STYLE" \
          aws s3 ls "s3://${R2_BUCKET_NAME}/" \
          --endpoint-url "$R2_ENDPOINT" \
          --region "$AWS_DEFAULT_REGION" | \
          grep 'supabase_backup_' | \
          awk '{print $4}' | \
          sort -r)

if [ -z "$BACKUPS" ]; then
  error "Test 5: FAILED - バックアップファイルが見つかりません"
  exit 1
fi

BACKUP_COUNT=$(echo "$BACKUPS" | wc -l)
success "Test 5: PASSED - $BACKUP_COUNT 個のバックアップファイルが見つかりました"

log "  最新のバックアップ:"
echo "$BACKUPS" | head -n 3 | while read -r backup; do
  log "    - $backup"
done
log ""

# ===== テスト6: Supabase データベースへの接続テスト =====
log "Test 6: Supabase データベースへの接続テスト..."

SUPABASE_DB_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
SUPABASE_DB_PORT=5432
SUPABASE_DB_USER="postgres"
SUPABASE_DB_NAME="postgres"

# IPv4 アドレスを取得
log "  Supabase ホストの IPv4 アドレスを解決中..."
SUPABASE_DB_HOST_IPV4=$(getent ahostsv4 "$SUPABASE_DB_HOST" 2>/dev/null | head -n 1 | awk '{print $1}')

if [ -z "$SUPABASE_DB_HOST_IPV4" ]; then
  log "  ⚠️ IPv4 アドレスの解決に失敗しました。ホスト名で接続を試みます..."
  SUPABASE_DB_HOST_IPV4="$SUPABASE_DB_HOST"
else
  log "  IPv4 アドレス: $SUPABASE_DB_HOST_IPV4"
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

if psql \
  -h "$SUPABASE_DB_HOST_IPV4" \
  -p "$SUPABASE_DB_PORT" \
  -U "$SUPABASE_DB_USER" \
  -d "$SUPABASE_DB_NAME" \
  -c "SELECT version();" &> /dev/null; then
  success "Test 6: PASSED - Supabase データベースに接続できます"
  
  # データベースバージョンを取得
  DB_VERSION=$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    -h "$SUPABASE_DB_HOST_IPV4" \
    -p "$SUPABASE_DB_PORT" \
    -U "$SUPABASE_DB_USER" \
    -d "$SUPABASE_DB_NAME" \
    -t -c "SELECT version();" 2>/dev/null | head -n 1 | xargs)
  log "  データベース: $DB_VERSION"
else
  error "Test 6: FAILED - Supabase データベースへの接続に失敗しました"
  error "  ホスト: $SUPABASE_DB_HOST_IPV4"
  error "  ポート: $SUPABASE_DB_PORT"
  error "  ユーザー: $SUPABASE_DB_USER"
  error "  データベース: $SUPABASE_DB_NAME"
  unset PGPASSWORD
  exit 1
fi

unset PGPASSWORD
log ""

# ===== テスト7: 復元スクリプトの存在確認 =====
log "Test 7: 復元スクリプトの存在確認..."
RESTORE_SCRIPT="${SCRIPT_DIR}/restore_from_r2.sh"

if [ -f "$RESTORE_SCRIPT" ]; then
  if [ -x "$RESTORE_SCRIPT" ]; then
    success "Test 7: PASSED - 復元スクリプトが存在し、実行可能です"
  else
    log "  ⚠️ 復元スクリプトは存在しますが、実行権限がありません"
    log "  実行権限を付与します..."
    chmod +x "$RESTORE_SCRIPT"
    success "Test 7: PASSED - 実行権限を付与しました"
  fi
else
  error "Test 7: FAILED - 復元スクリプトが見つかりません: $RESTORE_SCRIPT"
  exit 1
fi
log ""

# ===== すべてのテストが成功 =====
log "=========================================="
success "すべてのテストが成功しました！"
log "=========================================="
log ""
log "復元スクリプトは正常に動作する準備ができています。"
log "実際の復元を実行する場合は以下のコマンドを実行してください:"
log ""
log "  ./restore_from_r2.sh"
log ""
log "または、最新のバックアップを自動選択して復元:"
log ""
log "  ./restore_from_r2.sh 1"
log ""
log "=========================================="

exit 0
