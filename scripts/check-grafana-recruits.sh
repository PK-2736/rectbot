#!/bin/bash
# Grafana 募集ダッシュボードの動作確認スクリプト

set -e

echo "🔍 Grafana Recruits Dashboard - Health Check"
echo "=============================================="

# 1. バックエンドAPIの確認
echo ""
echo "1️⃣  Backend API /metrics エンドポイント確認..."
if curl -s -f -m 5 https://api.recrubo.net/metrics > /dev/null 2>&1; then
    echo "✅ /metrics エンドポイント: OK"
    curl -s https://api.recrubo.net/metrics | head -10
else
    echo "❌ /metrics エンドポイント: エラー"
    echo "   バックエンドがデプロイされているか確認してください"
fi

# 2. Grafana JSON API エンドポイント確認
echo ""
echo "2️⃣  Backend JSON API エンドポイント確認..."
RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d '{}' https://api.recrubo.net/api/grafana/recruits 2>&1)
if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
    echo "✅ /api/grafana/recruits エンドポイント: OK"
    echo "$RESPONSE" | jq -r 'if type == "array" then "募集数: \(length)件" else . end'
else
    echo "❌ /api/grafana/recruits エンドポイント: エラー"
    echo "   レスポンス: $RESPONSE"
fi

# 3. Prometheusの確認
echo ""
echo "3️⃣  Prometheus ターゲット確認..."
if docker ps | grep -q prometheus; then
    echo "✅ Prometheus コンテナ: 起動中"
    if curl -s http://localhost:9090/api/v1/targets 2>&1 | jq '.data.activeTargets[] | select(.labels.job=="cloudflare-backend")' > /dev/null 2>&1; then
        echo "✅ Cloudflare Backend スクレイプ設定: OK"
    else
        echo "⚠️  Cloudflare Backend スクレイプ設定: 見つかりません"
        echo "   docker compose -f docker-compose.monitoring.yml restart prometheus"
    fi
else
    echo "❌ Prometheus コンテナ: 停止中"
fi

# 4. Grafanaの確認
echo ""
echo "4️⃣  Grafana 確認..."
if docker ps | grep -q grafana; then
    echo "✅ Grafana コンテナ: 起動中"
    
    # データソース確認
    if [ -f "docker/monitoring/grafana/provisioning/datasources/json-api.yml" ]; then
        echo "✅ JSON API データソース設定: 存在"
    else
        echo "❌ JSON API データソース設定: 見つかりません"
    fi
    
    # ダッシュボード確認
    if [ -f "docker/monitoring/grafana/dashboards/recruits-dashboard.json" ]; then
        echo "✅ 募集ダッシュボード: 存在"
    else
        echo "❌ 募集ダッシュボード: 見つかりません"
    fi
else
    echo "❌ Grafana コンテナ: 停止中"
fi

# 5. 設定まとめ
echo ""
echo "=============================================="
echo "📋 次のステップ:"
echo ""
echo "1. バックエンドをデプロイ:"
echo "   cd backend && wrangler deploy"
echo ""
echo "2. 監視スタックを再起動:"
echo "   docker compose -f docker-compose.monitoring.yml restart"
echo ""
echo "3. Grafana にアクセス:"
echo "   https://grafana.recrubo.net"
echo ""
echo "4. ダッシュボードを開く:"
echo "   Dashboards → 📋 募集状況ダッシュボード"
echo ""
echo "詳細: docs/GRAFANA_RECRUITS_DASHBOARD.md"
echo "=============================================="
