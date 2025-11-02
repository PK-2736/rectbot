#!/bin/bash
# テスト用募集データを追加するスクリプト

API_URL="https://api.recrubo.net"

echo "🎮 テスト募集データを追加"
echo "=========================="

# サービストークンを設定（環境変数から取得）
if [ -z "$SERVICE_TOKEN" ]; then
    echo "⚠️  SERVICE_TOKEN が設定されていません"
    echo "   export SERVICE_TOKEN='your-token-here' を実行してください"
    exit 1
fi

# 募集データのサンプル
RECRUIT_DATA=$(cat << 'EOF'
{
  "title": "APEX ランク募集 @1",
  "game": "Apex Legends",
  "platform": "PC",
  "currentMembers": 2,
  "maxMembers": 3,
  "voice": true,
  "status": "recruiting",
  "ownerId": "test-user-123",
  "startTime": "2025-11-02T20:00:00Z"
}
EOF
)

echo "📝 送信データ:"
echo "$RECRUIT_DATA" | jq .

echo ""
echo "📤 APIにリクエスト中..."

# APIリクエスト
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/recruits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -d "$RECRUIT_DATA")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ 募集データを追加しました"
    echo "$BODY" | jq .
else
    echo "❌ エラーが発生しました (HTTP $HTTP_CODE)"
    echo "$BODY"
fi

echo ""
echo "📊 Grafanaで確認:"
echo "   https://grafana.recrubo.net"
echo ""
echo "🔍 データ確認:"
echo "   curl -X POST $API_URL/api/grafana/recruits -H 'Content-Type: application/json' -d '{}' | jq"
