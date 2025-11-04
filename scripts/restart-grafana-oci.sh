#!/bin/bash
# OCI上でGrafanaを再起動するスクリプト（ローカル実行用）

set -e

echo "🚀 Grafana設定を反映（OCI上で実行）"
echo "=========================================="

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "プロジェクトルート: ${PROJECT_ROOT}"
echo ""

# 設定ファイルの存在確認
echo "1️⃣  設定ファイルの確認..."
if [ ! -f "${PROJECT_ROOT}/docker/monitoring/grafana/provisioning/datasources/datasources.yml" ]; then
    echo "❌ datasources.yml が見つかりません"
    exit 1
fi
echo "✅ datasources.yml 存在確認"

if [ ! -f "${PROJECT_ROOT}/docker/monitoring/grafana/dashboards/recruits-dashboard.json" ]; then
    echo "❌ recruits-dashboard.json が見つかりません"
    exit 1
fi
echo "✅ recruits-dashboard.json 存在確認"

if [ ! -f "${PROJECT_ROOT}/docker-compose.monitoring.yml" ]; then
    echo "❌ docker-compose.monitoring.yml が見つかりません"
    exit 1
fi
echo "✅ docker-compose.monitoring.yml 存在確認"

# Grafanaプラグイン設定の確認
echo ""
echo "2️⃣  プラグイン設定の確認..."
if grep -q "yesoreyeram-infinity-datasource" "${PROJECT_ROOT}/docker-compose.monitoring.yml"; then
    echo "✅ Infinityプラグインが設定されています"
else
    echo "⚠️  Infinityプラグインが設定されていません"
    echo "   docker-compose.monitoring.yml を確認してください"
fi

# データソース設定の確認
echo ""
echo "3️⃣  データソース設定の確認..."
if grep -q "Cloudflare-Recruits-API" "${PROJECT_ROOT}/docker/monitoring/grafana/provisioning/datasources/datasources.yml"; then
    echo "✅ Cloudflare-Recruits-API データソースが設定されています"
else
    echo "⚠️  Cloudflare-Recruits-API データソースが設定されていません"
    echo "   datasources.yml を確認してください"
fi

# Grafanaコンテナの確認
echo ""
echo "4️⃣  Grafanaコンテナの確認..."
if docker ps --format '{{.Names}}' | grep -q "^grafana$"; then
    echo "✅ Grafanaコンテナが起動しています"
    
    # Grafanaを再起動
    echo ""
    echo "5️⃣  Grafanaを再起動中..."
    cd "${PROJECT_ROOT}"
    docker compose -f docker-compose.monitoring.yml restart grafana
    
    echo ""
    echo "⏳ プラグインのロードを待機中（30秒）..."
    sleep 30
    
    echo ""
    echo "6️⃣  Grafanaログを確認..."
    docker logs grafana --tail 50 2>&1 | grep -i "plugin\|infinity\|error" || echo "（関連ログなし）"
    
    echo ""
    echo "7️⃣  プラグインのインストール確認..."
    if docker exec grafana grafana-cli plugins list 2>/dev/null | grep -q "yesoreyeram-infinity-datasource"; then
        echo "✅ Infinityプラグインがインストールされています"
    else
        echo "⚠️  Infinityプラグインが見つかりません"
        echo "   手動でインストールが必要かもしれません："
        echo "   docker exec grafana grafana-cli plugins install yesoreyeram-infinity-datasource"
    fi
    
else
    echo "❌ Grafanaコンテナが起動していません"
    echo ""
    echo "Grafanaを起動しますか？ (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Grafanaを起動中..."
        cd "${PROJECT_ROOT}"
        docker compose -f docker-compose.monitoring.yml up -d grafana
        echo "⏳ 起動とプラグインロードを待機中（60秒）..."
        sleep 60
        docker logs grafana --tail 50
    else
        echo "スキップしました"
        exit 0
    fi
fi

echo ""
echo "=========================================="
echo "✅ 処理完了！"
echo ""
echo "📊 次のステップ:"
echo "1. Grafana にアクセス: https://grafana.recrubo.net"
echo "2. Configuration → Data Sources"
echo "   → 'Cloudflare-Recruits-API' が表示されることを確認"
echo "3. Dashboards → '📋 募集状況ダッシュボード'"
echo "   → 3つのテーブルパネルでデータが表示されることを確認"
echo ""
echo "💡 トラブルシューティング:"
echo "- データソースが見つからない場合:"
echo "  docker compose -f docker-compose.monitoring.yml restart grafana"
echo ""
echo "- プラグインが見つからない場合:"
echo "  docker exec grafana grafana-cli plugins install yesoreyeram-infinity-datasource"
echo "  docker compose -f docker-compose.monitoring.yml restart grafana"
echo ""
echo "- ログを確認:"
echo "  docker logs grafana --tail 100"
echo "=========================================="
