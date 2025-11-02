#!/bin/bash
# Sentry データソース設定スクリプト

echo "🔴 Sentry データソース設定"
echo "============================"
echo ""

# Sentry Auth Token の入力
echo "📝 Sentry Auth Token を入力してください"
echo ""
echo "取得方法:"
echo "1. https://rectbot.sentry.io にアクセス"
echo "2. Settings → Account → API → Auth Tokens"
echo "3. 'Create New Token' で以下の権限を付与:"
echo "   - Project: Read"
echo "   - Event: Read"  
echo "   - Organization: Read"
echo ""

read -sp "Sentry Auth Token: " SENTRY_TOKEN
echo ""

if [ -z "$SENTRY_TOKEN" ]; then
    echo "❌ トークンが入力されていません"
    exit 1
fi

# .env ファイルに保存
ENV_FILE=~/rectbot/.env

if [ ! -f "$ENV_FILE" ]; then
    touch "$ENV_FILE"
fi

# 既存のSENTRY_AUTH_TOKEN行を削除
sed -i '/^SENTRY_AUTH_TOKEN=/d' "$ENV_FILE" 2>/dev/null || true

# 新しいトークンを追加
echo "SENTRY_AUTH_TOKEN=$SENTRY_TOKEN" >> "$ENV_FILE"

echo ""
echo "✅ .env ファイルに保存しました"

# Grafanaを再起動
echo ""
echo "🔄 Grafanaを再起動中..."
cd ~/rectbot
docker compose -f docker-compose.monitoring.yml restart grafana

echo ""
echo "⏳ Grafanaの初期化を待機中（30秒）..."
sleep 30

echo ""
echo "============================"
echo "✅ セットアップ完了！"
echo ""
echo "📊 Grafanaで確認:"
echo "   https://grafana.recrubo.net"
echo ""
echo "🔧 データソースの確認:"
echo "   Configuration → Data sources → Sentry"
echo ""
echo "📈 ダッシュボード:"
echo "   Dashboards → 🔴 Sentryエラー監視"
echo ""
echo "💡 表示される情報:"
echo "   - エラー総数（24時間）"
echo "   - 影響を受けたユーザー数"
echo "   - エラー推移グラフ"
echo "   - エラー一覧テーブル（発生回数順）"
echo "============================"
