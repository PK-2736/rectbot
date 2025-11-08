#!/bin/bash

# Grafana トークン設定スクリプト
# このスクリプトは Grafana データソースの認証トークンを設定します

set -e

echo "🔐 Grafana トークン設定"
echo "=========================================="
echo ""

# .env ファイルの確認
if [ ! -f .env ]; then
    echo "❌ .env ファイルが見つかりません"
    echo "💡 .env.example をコピーして .env を作成してください:"
    echo "   cp .env.example .env"
    echo ""
    exit 1
fi

# GRAFANA_TOKEN の確認
if grep -q "^GRAFANA_TOKEN=" .env; then
    echo "✅ GRAFANA_TOKEN が .env に設定されています"
    TOKEN_VALUE=$(grep "^GRAFANA_TOKEN=" .env | cut -d '=' -f2)
    if [ -z "$TOKEN_VALUE" ] || [ "$TOKEN_VALUE" = "your_grafana_access_token_here" ]; then
        echo "⚠️  トークンの値が未設定またはデフォルト値です"
        echo ""
        echo "新しいトークンを生成しますか? (y/N): "
        read -r GENERATE
        if [ "$GENERATE" = "y" ] || [ "$GENERATE" = "Y" ]; then
            NEW_TOKEN=$(openssl rand -hex 32)
            echo ""
            echo "🔑 新しいトークン:"
            echo "   $NEW_TOKEN"
            echo ""
            
            # .env を更新
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^GRAFANA_TOKEN=.*/GRAFANA_TOKEN=$NEW_TOKEN/" .env
            else
                sed -i "s/^GRAFANA_TOKEN=.*/GRAFANA_TOKEN=$NEW_TOKEN/" .env
            fi
            
            echo "✅ .env の GRAFANA_TOKEN を更新しました"
            echo ""
        fi
    else
        echo "   現在の値: ${TOKEN_VALUE:0:20}..."
        echo ""
    fi
else
    echo "⚠️  GRAFANA_TOKEN が .env に見つかりません"
    echo ""
    echo "新しいトークンを追加しますか? (y/N): "
    read -r ADD
    if [ "$ADD" = "y" ] || [ "$ADD" = "Y" ]; then
        NEW_TOKEN=$(openssl rand -hex 32)
        echo "" >> .env
        echo "# Grafana データソース用トークン" >> .env
        echo "GRAFANA_TOKEN=$NEW_TOKEN" >> .env
        echo ""
        echo "✅ .env に GRAFANA_TOKEN を追加しました"
        echo "   トークン: $NEW_TOKEN"
        echo ""
    fi
fi

echo "=========================================="
echo ""
echo "📋 次のステップ:"
echo ""
echo "1️⃣  Cloudflare Worker にも同じトークンを設定:"
echo ""
echo "   cd backend"
echo "   wrangler secret put GRAFANA_ACCESS_TOKEN"
echo "   # プロンプトが表示されたら、.env の GRAFANA_TOKEN と同じ値を入力"
echo ""
echo "   または Cloudflare Dashboard:"
echo "   Workers & Pages → [あなたのWorker] → Settings → Variables"
echo "   → 'GRAFANA_ACCESS_TOKEN' を追加"
echo ""
echo "2️⃣  Grafana コンテナを再起動:"
echo ""
echo "   docker-compose -f docker-compose.monitoring.yml restart grafana"
echo ""
echo "3️⃣  データソース接続をテスト:"
echo ""
echo "   curl -H \"Authorization: Bearer \$(grep GRAFANA_TOKEN .env | cut -d= -f2)\" \\"
echo "        https://api.recrubo.net/api/grafana/recruits"
echo ""
echo "=========================================="
