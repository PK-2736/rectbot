#!/bin/bash
# rectbot 環境チェックスクリプト
# サーバー設定・ネットワーク・アプリロジックの基本的な健全性を確認

set -e

# 1. Dockerコンテナの状態

echo "\n=== Dockerコンテナ状態 ==="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "\n=== 各サービスのリソース使用状況 ==="
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'

# 2. ネットワーク疎通

echo "\n=== ネットワーク疎通チェック (Appwrite, MariaDB, Redis) ==="
docker exec appwrite ping -c 2 appwrite-mariadb || echo "[NG] appwrite→mariadb ping失敗"
docker exec appwrite ping -c 2 appwrite-redis || echo "[NG] appwrite→redis ping失敗"

echo "\n=== 外部ネットワーク疎通 (Google DNS) ==="
ping -c 2 8.8.8.8 || echo "[NG] サーバー→外部ネットワーク疎通失敗"

# 3. Appwrite APIヘルスチェック

echo "\n=== Appwrite APIヘルスチェック ==="
curl -sSf http://localhost:8080/v1/health/version || echo "[NG] Appwrite APIヘルスチェック失敗"

# 4. .envファイルの存在と主要変数チェック

echo "\n=== .envファイル主要変数チェック (backend/.env) ==="
if [ -f backend/.env ]; then
  grep -E 'APPWRITE_PROJECT_ID|APPWRITE_API_KEY|DISCORD_CLIENT_ID|STRIPE_API_KEY' backend/.env || echo "[NG] .env主要変数が不足しています"
else
  echo "[NG] backend/.envが存在しません"
fi

# 5. FastAPIアプリの起動確認

echo "\n=== FastAPI (backend) サーバー起動確認 ==="
if curl -sSf http://localhost:8000/health > /dev/null; then
  echo "[OK] FastAPIサーバー起動中"
else
  echo "[NG] FastAPIサーバーが起動していません"
fi

# 6. Appwrite DBスキーマの属性チェック例（id, discord_id, plan, expires_at）
echo "\n=== Appwrite DB属性チェック（手動確認推奨） ==="
echo "Appwrite管理画面で各コレクションの属性（id, discord_id, plan, expires_at等）が存在するか確認してください。"

echo "\n=== チェック完了 ==="
