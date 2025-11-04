#!/bin/bash
# Grafana 募集ダッシュボード デプロイスクリプト

set -e

echo "🚀 Grafana Recruits Dashboard - デプロイ"
echo "=========================================="

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "プロジェクトルート: ${PROJECT_ROOT}"
echo ""

# 1. バックエンドのデプロイ
echo ""
echo "1️⃣  バックエンドをデプロイ中..."
cd "${PROJECT_ROOT}/backend"
if command -v wrangler &> /dev/null; then
    echo "Cloudflare Wrangler でデプロイ..."
    wrangler deploy --env production 2>&1 || wrangler deploy 2>&1 || echo "⚠️  デプロイに失敗しました。手動で 'cd backend && wrangler deploy' を実行してください。"
else
    echo "❌ Wrangler がインストールされていません"
    echo "   npm install -g wrangler でインストールしてください"
    exit 1
fi
cd "${PROJECT_ROOT}"

# 2. Prometheusの再起動
echo ""
echo "2️⃣  Prometheus を再起動中..."
if docker ps | grep -q prometheus; then
    cd "${PROJECT_ROOT}"
    docker compose -f docker-compose.monitoring.yml restart prometheus
    echo "✅ Prometheus 再起動完了"
else
    echo "⚠️  Prometheus コンテナが起動していません"
    echo "   docker compose -f docker-compose.monitoring.yml up -d"
fi

# 3. Grafanaの再起動
echo ""
echo "3️⃣  Grafana を再起動中..."
if docker ps | grep -q grafana; then
    cd "${PROJECT_ROOT}"
    docker compose -f docker-compose.monitoring.yml restart grafana
    echo "✅ Grafana 再起動完了"
    echo "   プラグインのロードに約30秒かかります..."
    sleep 5
else
    echo "⚠️  Grafana コンテナが起動していません"
    echo "   docker compose -f docker-compose.monitoring.yml up -d"
fi

# 4. 動作確認
echo ""
echo "4️⃣  動作確認中..."
sleep 3

# メトリクスエンドポイント確認
echo ""
echo "📊 Metrics エンドポイント:"
if curl -s -f -m 10 https://api.recrubo.net/metrics > /tmp/metrics.txt 2>&1; then
    echo "✅ https://api.recrubo.net/metrics"
    head -15 /tmp/metrics.txt
else
    echo "❌ https://api.recrubo.net/metrics (エラー)"
    echo "   バックエンドのデプロイを確認してください"
fi

# Grafana APIエンドポイント確認
echo ""
echo "🎮 Grafana API エンドポイント:"
RECRUITS_DATA=$(curl -s -X POST -H "Content-Type: application/json" -d '{}' https://api.recrubo.net/api/grafana/recruits 2>&1)
if echo "$RECRUITS_DATA" | jq . > /dev/null 2>&1; then
    echo "✅ https://api.recrubo.net/api/grafana/recruits"
    echo "$RECRUITS_DATA" | jq -r 'if type == "array" then "募集データ: \(length)件" else . end'
else
    echo "❌ https://api.recrubo.net/api/grafana/recruits (エラー)"
    echo "   レスポンス: $RECRUITS_DATA"
fi

# Prometheus ターゲット確認
echo ""
echo "🎯 Prometheus スクレイプターゲット:"
if curl -s http://localhost:9090/api/v1/targets 2>&1 | jq -r '.data.activeTargets[] | select(.labels.job=="cloudflare-backend") | "✅ \(.labels.job) - \(.health) - \(.lastScrape)"' 2>/dev/null | head -1; then
    echo "   Cloudflare Backend ターゲットが設定されています"
else
    echo "⚠️  Cloudflare Backend ターゲットが見つかりません"
    echo "   数分待ってから再確認してください"
fi

echo ""
echo "=========================================="
echo "✅ デプロイ完了!"
echo ""
echo "📊 次のステップ:"
echo "1. Grafana にアクセス: https://grafana.recrubo.net"
echo "2. 左メニュー → Dashboards"
echo "3. '📋 募集状況ダッシュボード' を開く"
echo ""
echo "💡 ヒント:"
echo "- ダッシュボードが表示されない場合は、Grafana を再起動してください"
echo "- データソースエラーが出る場合は、Configuration → Data Sources で確認"
echo "- メトリクスが表示されない場合は、数分待ってPrometheusがスクレイプするのを待ちます"
echo ""
echo "📖 詳細: docs/GRAFANA_RECRUITS_DASHBOARD.md"
echo "=========================================="
