#!/bin/bash

# ラッパー: ルートの .env.backup をロードして既存の scripts/restore_from_r2.sh を実行
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

ENV_FILE="$REPO_DIR/.env.backup"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

exec "$REPO_DIR/scripts/restore_from_r2.sh" "$@"
