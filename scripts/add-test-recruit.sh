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
# recruitId を自動生成（日時ベース）
RECRUIT_ID="test-$(date +%Y%m%d%H%M%S)"

RECRUIT_DATA=$(cat << EOF
{
  "recruitId": "${RECRUIT_ID}",
  "title": "APEX ランク募集 @1",
  "game": "Apex Legends",
  "platform": "PC",
  "currentMembers": 2,
  "maxMembers": 3,
  "voice": true,
  "status": "recruiting",
  "ownerId": "test-user-123",
  "startTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
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
  echo ""
  echo "🔎 確認: /api/grafana/recruits (一覧)"
  curl -s -X POST "$API_URL/api/grafana/recruits" -H 'Content-Type: application/json' -d '{}' | jq '.[0]'
  echo ""
  echo "🔎 確認: /api/grafana/recruits/at (As-Of)"
  NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  curl -s -X POST "$API_URL/api/grafana/recruits/at" -H 'Content-Type: application/json' -d '{"range":{"to":"'"$NOW_ISO"'"}}' | jq '.[0]'
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
