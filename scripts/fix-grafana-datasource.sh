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
echo "4️⃣  トークン取得..."
# 優先順位: 1) 環境変数 GRAFANA_TOKEN 2) .env 3) なし
TOKEN_VALUE=""
if [ -n "${GRAFANA_TOKEN}" ]; then
    TOKEN_VALUE="${GRAFANA_TOKEN}"
    echo "✅ 環境変数 GRAFANA_TOKEN がセットされています (CI/一時利用モード)"
elif [ -f "${PROJECT_ROOT}/.env" ] && grep -q "^GRAFANA_TOKEN=" "${PROJECT_ROOT}/.env"; then
    TOKEN_VALUE=$(grep "^GRAFANA_TOKEN=" "${PROJECT_ROOT}/.env" | cut -d '=' -f2)
    if [ -z "$TOKEN_VALUE" ] || [ "$TOKEN_VALUE" = "your_grafana_access_token_here" ]; then
        echo "⚠️  GRAFANA_TOKEN が未設定またはダミー値 (.env)"
    else
        echo "✅ .env から GRAFANA_TOKEN を取得"
    fi
else
    echo "⚠️  トークンが見つかりません (環境変数 / .env なし)"
    echo "   CIなら 'GRAFANA_TOKEN=xxxx ./scripts/fix-grafana-datasource.sh' のように実行可能"
fi

echo ""
echo "5️⃣  エンドポイント動作確認..."
echo ""
echo "📊 /metrics エンドポイント (認証不要):"
if curl -s -f -m 5 https://api.recrubo.net/metrics > /tmp/metrics.txt 2>&1; then
    echo "✅ https://api.recrubo.net/metrics"
    head -15 /tmp/metrics.txt
else
    echo "❌ https://api.recrubo.net/metrics (エラー)"
fi

echo ""
echo "🎮 /api/grafana/recruits エンドポイント:"

# まず未認証
RECRUITS_DATA_UNAUTH=$(curl -s -X POST -H "Content-Type: application/json" -d '{}' https://api.recrubo.net/api/grafana/recruits 2>&1 || true)
if echo "$RECRUITS_DATA_UNAUTH" | grep -qi unauthorized; then
    echo "⚠️  未認証リクエスト: 401 (想定通り)"
else
    echo "✅ 未認証でも 200 (公開状態)"
fi

# 認証ありテスト (トークンがある場合のみ)
if [ -n "$TOKEN_VALUE" ] && [ "$TOKEN_VALUE" != "your_grafana_access_token_here" ]; then
    echo "   認証付きテスト中 (Bearer)..."
    RECRUITS_DATA_AUTH=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_VALUE" -d '{}' https://api.recrubo.net/api/grafana/recruits 2>&1 || true)
    if echo "$RECRUITS_DATA_AUTH" | jq . > /dev/null 2>&1; then
        echo "   ✅ 成功 $(echo "$RECRUITS_DATA_AUTH" | jq 'length? // empty') 件"
    else
        echo "   ❌ 失敗: $RECRUITS_DATA_AUTH"
    fi
fi

echo ""
echo "=========================================="
echo "✅ 処理完了！"
echo ""
echo "📋 次のステップ:"
echo ""
echo "🔐 1. トークンの設定（まだの場合）:"
echo "   ./scripts/setup-grafana-token.sh"
echo ""
echo "   その後、Cloudflare Worker にも設定:"
echo "   cd backend && wrangler secret put GRAFANA_ACCESS_TOKEN"
echo ""
echo "🌐 2. Grafana にアクセス:"
echo "   https://grafana.recrubo.net"
echo ""
echo "⚙️  3. データソースを確認:"
echo "   Configuration → Data Sources → 'Cloudflare-Recruits-API'"
echo ""
echo "   確認事項:"
echo "   ✓ URL: https://api.recrubo.net （パスなし）"
echo "   ✓ Auth Method: Bearer Token"
echo "   ✓ Bearer Token: (CIでは環境変数注入 / ローカルは .env 参照)"
echo "   ✓ 'Save & Test' で接続確認"
echo ""
echo "📊 4. ダッシュボードでデータ確認:"
echo "   Dashboards → '📋 募集状況ダッシュボード'"
echo ""
echo "💡 トラブルシューティング:"
echo "   401 Unauthorized → docs/GRAFANA_AUTH_TROUBLESHOOTING.md"
echo "   詳細ガイド → docs/GRAFANA_RECRUITS_DASHBOARD.md"
echo "=========================================="
