#!/bin/bash

# Grafana トークン設定スクリプト (CI / ローカル両対応)
# 目的:
#  - ローカル: .env を補助しつつ安全にトークン生成
#  - CI: GRAFANA_TOKEN 環境変数を渡してファイルを書かずに後続処理へ

set -e

echo "🔐 Grafana トークン設定"
echo "=========================================="
echo ""

MODE_CI="false"
if [ -n "${GRAFANA_TOKEN}" ]; then
    MODE_CI="true"
    echo "CIモード検出: 環境変数 GRAFANA_TOKEN を使用 (.env 変更なし)"
fi

if [ "${MODE_CI}" = "false" ] && [ ! -f .env ]; then
    echo "❌ .env ファイルが見つかりません (ローカル)"
    echo "💡 cp .env.example .env で作成してください"
    exit 1
fi

if [ "${MODE_CI}" = "true" ]; then
    echo "✅ CIモード: トークン先頭20桁 => ${GRAFANA_TOKEN:0:20}..."
else
    if grep -q "^GRAFANA_TOKEN=" .env 2>/dev/null; then
        echo "✅ .env に GRAFANA_TOKEN が存在"
        TOKEN_VALUE=$(grep "^GRAFANA_TOKEN=" .env | cut -d '=' -f2)
        if [ -z "${TOKEN_VALUE}" ] || [ "${TOKEN_VALUE}" = "your_grafana_access_token_here" ]; then
            echo "⚠️  未設定またはダミー値"
            read -r -p "新しいトークンを生成しますか? (y/N): " GEN
            if [[ "${GEN}" =~ ^[Yy]$ ]]; then
                NEW_TOKEN=$(openssl rand -hex 32)
                if [[ "${OSTYPE}" == "darwin"* ]]; then
                    sed -i '' "s/^GRAFANA_TOKEN=.*/GRAFANA_TOKEN=${NEW_TOKEN}/" .env
                else
                    sed -i "s/^GRAFANA_TOKEN=.*/GRAFANA_TOKEN=${NEW_TOKEN}/" .env
                fi
                echo "✅ 更新: ${NEW_TOKEN}"
            fi
        else
            echo "   現在値: ${TOKEN_VALUE:0:20}..."
        fi
    else
        echo "⚠️  .env に GRAFANA_TOKEN がありません"
        read -r -p "追加しますか? (y/N): " ADD
        if [[ "${ADD}" =~ ^[Yy]$ ]]; then
            NEW_TOKEN=$(openssl rand -hex 32)
            printf "\n# Grafana データソース用トークン\nGRAFANA_TOKEN=%s\n" "${NEW_TOKEN}" >> .env
            echo "✅ 追加: ${NEW_TOKEN}"
        fi
    fi
fi

echo "=========================================="
echo "📋 次のステップ"
echo ""
echo "1️⃣  Cloudflare Worker Secret 同期"
if [ "${MODE_CI}" = "true" ]; then
    echo "   echo \"$GRAFANA_TOKEN\" | wrangler secret put GRAFANA_ACCESS_TOKEN"
else
    echo "   cd backend && wrangler secret put GRAFANA_ACCESS_TOKEN  # .env の値を貼り付け"
fi
echo ""
echo "2️⃣  Grafana 再起動 (必要なら)"
echo "   docker-compose -f docker-compose.monitoring.yml restart grafana"
echo ""
echo "3️⃣  テスト"
if [ "${MODE_CI}" = "true" ]; then
    echo "   curl -H 'Authorization: Bearer ${GRAFANA_TOKEN}' https://api.recrubo.net/api/grafana/recruits -X POST"
else
    echo "   TOKEN=\$(grep GRAFANA_TOKEN .env | cut -d= -f2)"
    echo "   curl -H \"Authorization: Bearer $TOKEN\" -X POST https://api.recrubo.net/api/grafana/recruits"
fi
echo ""
echo "✅ 完了"
echo "=========================================="
