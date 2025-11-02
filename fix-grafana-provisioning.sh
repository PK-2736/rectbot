#!/bin/bash
# Grafana provisioning ディレクトリを修正するスクリプト

echo "=== Grafana Provisioning 修正スクリプト ==="

# サーバー上のプロビジョニングディレクトリのパス
PROVISIONING_DIR="/home/ubuntu/rectbot/docker/monitoring/grafana/provisioning"

# 必要なサブディレクトリを作成
echo "1. 必要なディレクトリを作成中..."
sudo mkdir -p "$PROVISIONING_DIR/datasources"
sudo mkdir -p "$PROVISIONING_DIR/dashboards"
sudo mkdir -p "$PROVISIONING_DIR/alerting"
sudo mkdir -p "$PROVISIONING_DIR/notifiers"
sudo mkdir -p "$PROVISIONING_DIR/plugins"

# ワークスペースからファイルをコピー（存在する場合）
if [ -d "/workspaces/rectbot/docker/monitoring/grafana/provisioning" ]; then
    echo "2. ワークスペースからファイルをコピー中..."
    sudo cp -r /workspaces/rectbot/docker/monitoring/grafana/provisioning/* "$PROVISIONING_DIR/"
else
    echo "2. ワークスペースディレクトリが見つかりません。手動でコピーしてください。"
fi

# 権限を設定
echo "3. 権限を設定中..."
sudo chown -R 472:472 "$PROVISIONING_DIR"
sudo chmod -R 755 "$PROVISIONING_DIR"

# 内容を確認
echo "4. 作成されたファイルを確認:"
ls -la "$PROVISIONING_DIR/"
ls -la "$PROVISIONING_DIR/datasources/"

# Grafana コンテナを再起動
echo "5. Grafana コンテナを再起動中..."
cd /home/ubuntu/rectbot
docker-compose -f docker-compose.monitoring.yml restart grafana

echo ""
echo "=== 完了 ==="
echo "Grafana が再起動されました。数秒待ってからブラウザで確認してください。"
echo ""
echo "ログを確認するには:"
echo "  docker logs grafana --tail 50"
