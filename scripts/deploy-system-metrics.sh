#!/bin/bash
# システムメトリクス監視のデプロイスクリプト

set -e

echo "🖥️  システムリソース監視 - デプロイ"
echo "========================================"

cd ~/rectbot

echo ""
echo "1️⃣  Docker Composeファイルを確認..."
if grep -q "node-exporter" docker-compose.monitoring.yml; then
    echo "✅ Node Exporter 設定済み"
else
    echo "❌ Node Exporter が設定されていません"
    exit 1
fi

if grep -q "cadvisor" docker-compose.monitoring.yml; then
    echo "✅ cAdvisor 設定済み"
else
    echo "❌ cAdvisor が設定されていません"
    exit 1
fi

echo ""
echo "2️⃣  Prometheus設定を確認..."
if grep -q "node-exporter" docker/monitoring/prometheus/conf/custom.yml; then
    echo "✅ Node Exporter スクレイプ設定済み"
else
    echo "❌ Node Exporter スクレイプ設定がありません"
    exit 1
fi

if grep -q "cadvisor" docker/monitoring/prometheus/conf/custom.yml; then
    echo "✅ cAdvisor スクレイプ設定済み"
else
    echo "❌ cAdvisor スクレイプ設定がありません"
    exit 1
fi

echo ""
echo "3️⃣  ダッシュボードを確認..."
if [ -f "docker/monitoring/grafana/dashboards/system-metrics-dashboard.json" ]; then
    echo "✅ システムメトリクスダッシュボード存在"
else
    echo "❌ システムメトリクスダッシュボードがありません"
    exit 1
fi

echo ""
echo "4️⃣  コンテナをデプロイ..."
docker compose -f docker-compose.monitoring.yml up -d node-exporter cadvisor

echo ""
echo "5️⃣  Prometheusを再起動..."
docker compose -f docker-compose.monitoring.yml restart prometheus

echo ""
echo "6️⃣  Grafanaを再起動..."
docker compose -f docker-compose.monitoring.yml restart grafana

echo ""
echo "⏳ 初期化を待機中（30秒）..."
sleep 30

echo ""
echo "7️⃣  動作確認..."
echo ""
echo "Node Exporter:"
if curl -s http://localhost:9100/metrics | head -5 | grep -q "node_"; then
    echo "✅ http://localhost:9100/metrics - 正常"
else
    echo "❌ Node Exporter が応答していません"
fi

echo ""
echo "cAdvisor:"
if curl -s http://localhost:8080/metrics | head -5 | grep -q "container_"; then
    echo "✅ http://localhost:8080/metrics - 正常"
else
    echo "❌ cAdvisor が応答していません"
fi

echo ""
echo "Prometheus Targets:"
TARGETS=$(curl -s http://localhost:9090/api/v1/targets | jq -r '.data.activeTargets[] | select(.labels.job=="node-exporter" or .labels.job=="cadvisor") | "\(.labels.job): \(.health)"')
if [ -n "$TARGETS" ]; then
    echo "✅ Prometheusターゲット:"
    echo "$TARGETS"
else
    echo "⚠️  Prometheusターゲットが見つかりません（数分待ってください）"
fi

echo ""
echo "========================================"
echo "✅ デプロイ完了！"
echo ""
echo "📊 Grafanaで確認:"
echo "   https://grafana.recrubo.net"
echo ""
echo "🖥️  新しいダッシュボード:"
echo "   Dashboards → 🖥️ システムリソース監視"
echo ""
echo "💡 表示される情報:"
echo "   - CPU使用率（ゲージ＋グラフ）"
echo "   - メモリ使用率（ゲージ＋詳細）"
echo "   - ディスク使用率"
echo "   - ネットワークトラフィック"
echo "   - コンテナ別CPU/メモリ使用量"
echo ""
echo "🔍 直接メトリクスを確認:"
echo "   curl http://localhost:9100/metrics | grep node_cpu"
echo "   curl http://localhost:8080/metrics | grep container_cpu"
echo "========================================"
