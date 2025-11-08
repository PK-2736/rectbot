#!/bin/bash
# Grafana データソース修正スクリプト
# gtafana typo や 401/404 エラーの修正

set -e

echo "🔧 Grafana データソース修正"
echo "=========================================="

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "1️⃣  Grafana コンテナの確認..."
if ! docker ps | grep -q grafana; then
    echo "❌ Grafana コンテナが起動していません"
    echo "   docker compose -f docker-compose.monitoring.yml up -d grafana"
    exit 1
fi

echo "✅ Grafana コンテナが起動しています"

echo ""
echo "2️⃣  Grafana を再起動してプロビジョニング設定を再読み込み..."
cd "${PROJECT_ROOT}"
docker compose -f docker-compose.monitoring.yml restart grafana

echo ""
echo "⏳ プラグインとデータソースのロードを待機（30秒）..."
sleep 30

echo ""
echo "3️⃣  Grafana ログを確認..."
docker logs grafana --tail 100 2>&1 | grep -i "datasource\|infinity\|error\|401\|404" || echo "（関連ログなし）"

echo ""
echo "4️⃣  エンドポイント動作確認..."
echo ""
echo "📊 /metrics エンドポイント:"
if curl -s -f -m 5 https://api.recrubo.net/metrics > /tmp/metrics.txt 2>&1; then
    echo "✅ https://api.recrubo.net/metrics"
    head -15 /tmp/metrics.txt
else
    echo "❌ https://api.recrubo.net/metrics (エラー)"
fi

echo ""
echo "🎮 /api/grafana/recruits エンドポイント:"
RECRUITS_DATA=$(curl -s -X POST -H "Content-Type: application/json" -d '{}' https://api.recrubo.net/api/grafana/recruits 2>&1)
if echo "$RECRUITS_DATA" | jq . > /dev/null 2>&1; then
    echo "✅ https://api.recrubo.net/api/grafana/recruits"
    echo "$RECRUITS_DATA" | jq -r 'if type=="array" then "募集数: \(length)件" else . end'
else
    echo "❌ https://api.recrubo.net/api/grafana/recruits"
    echo "$RECRUITS_DATA"
fi

echo ""
echo "=========================================="
echo "✅ 処理完了！"
echo ""
echo "📋 次の手順:"
echo ""
echo "1. Grafana にアクセス: https://grafana.recrubo.net"
echo ""
echo "2. Configuration → Data Sources"
echo "   → 'Cloudflare-Recruits-API' を選択"
echo ""
echo "3. 以下を確認・修正:"
echo "   ✓ URL: https://api.recrubo.net （パスなし）"
echo "   ✓ Authentication: Bearer Token"
echo "   ✓ Bearer Token: 正しいトークンを設定"
echo "   ✓ 'Save & Test' をクリック"
echo ""
echo "4. Dashboards → '📋 募集状況ダッシュボード'"
echo "   → パネルにデータが表示されることを確認"
echo ""
echo "💡 よくある問題:"
echo "   - URL に '/api/grafana' や '/api/gtafana' が含まれている"
echo "     → URL は https://api.recrubo.net のみにする"
echo "   - Bearer Token が未設定または期限切れ"
echo "     → Cloudflare ダッシュボードで新しいトークンを発行"
echo "   - ダッシュボードのパネル設定で相対パス '/api/grafana/recruits' を使用"
echo "     → これは正しい（データソースのBase URLに追加される）"
echo ""
echo "詳細: docs/GRAFANA_RECRUITS_DASHBOARD.md"
echo "=========================================="
