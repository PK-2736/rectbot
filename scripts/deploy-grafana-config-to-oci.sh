#!/bin/bash
# Grafana設定ファイルをOCIにデプロイするスクリプト

set -e

# OCI接続情報（環境変数またはここに直接設定）
OCI_HOST="${OCI_HOST:-your-oci-host}"
OCI_USER="${OCI_USER:-ubuntu}"
OCI_PATH="${OCI_PATH:-/home/ubuntu/rectbot}"

echo "🚀 Grafana設定ファイルをOCIにデプロイ"
echo "=========================================="
echo "デプロイ先: ${OCI_USER}@${OCI_HOST}:${OCI_PATH}"
echo ""

# 1. データソース設定をコピー
echo "1️⃣  データソース設定をコピー中..."
scp docker/monitoring/grafana/provisioning/datasources/datasources.yml \
    ${OCI_USER}@${OCI_HOST}:${OCI_PATH}/docker/monitoring/grafana/provisioning/datasources/datasources.yml

echo "✅ datasources.yml をコピーしました"

# 2. ダッシュボード設定をコピー
echo ""
echo "2️⃣  ダッシュボード設定をコピー中..."
scp docker/monitoring/grafana/dashboards/recruits-dashboard.json \
    ${OCI_USER}@${OCI_HOST}:${OCI_PATH}/docker/monitoring/grafana/dashboards/recruits-dashboard.json

echo "✅ recruits-dashboard.json をコピーしました"

# 3. docker-compose.monitoring.ymlをコピー
echo ""
echo "3️⃣  docker-compose.monitoring.yml をコピー中..."
scp docker-compose.monitoring.yml \
    ${OCI_USER}@${OCI_HOST}:${OCI_PATH}/docker-compose.monitoring.yml

echo "✅ docker-compose.monitoring.yml をコピーしました"

# 4. OCI上でGrafanaを再起動
echo ""
echo "4️⃣  OCI上でGrafanaを再起動中..."
ssh ${OCI_USER}@${OCI_HOST} << 'ENDSSH'
cd /home/ubuntu/rectbot
echo "Grafanaコンテナを再起動..."
docker compose -f docker-compose.monitoring.yml restart grafana
echo "✅ Grafana再起動完了"
echo "プラグインのインストールとロードに約30-60秒かかります..."
sleep 10
docker logs grafana --tail 50
ENDSSH

echo ""
echo "=========================================="
echo "✅ デプロイ完了!"
echo ""
echo "📊 次のステップ:"
echo "1. Grafana にアクセス: https://grafana.recrubo.net"
echo "2. Configuration → Plugins で 'Infinity' プラグインが有効か確認"
echo "3. Configuration → Data Sources で 'Cloudflare-Recruits-API' が追加されているか確認"
echo "4. Dashboards → '📋 募集状況ダッシュボード' を開く"
echo ""
echo "💡 トラブルシューティング:"
echo "- プラグインが見つからない場合:"
echo "  ssh ${OCI_USER}@${OCI_HOST}"
echo "  docker exec -it grafana grafana-cli plugins list"
echo ""
echo "- データソースエラーの場合:"
echo "  docker logs grafana | grep -i error"
echo ""
echo "- Grafanaログを確認:"
echo "  ssh ${OCI_USER}@${OCI_HOST} 'docker logs grafana --tail 100'"
echo "=========================================="
