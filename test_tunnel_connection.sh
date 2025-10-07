#!/bin/bash

echo "=== Tunnel URL 接続テスト ==="
echo ""

TUNNEL_URL="https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com"
SERVICE_TOKEN="rectbot-service-token-2024"

echo "1. Tunnel URL で recruitment list を取得:"
echo "URL: ${TUNNEL_URL}/api/recruitment/list"
echo ""
curl -v "${TUNNEL_URL}/api/recruitment/list" \
  -H "x-service-token: ${SERVICE_TOKEN}" \
  2>&1 | grep -E "< HTTP|< HTTP/2|^\[\]|error|503|401"

echo ""
echo ""
echo "2. Tunnel URL で dashboard recruitment を取得:"
echo "URL: ${TUNNEL_URL}/api/dashboard/recruitment"
echo ""
curl -v "${TUNNEL_URL}/api/dashboard/recruitment" \
  2>&1 | grep -E "< HTTP|< HTTP/2|^\[\]|error|503"

echo ""
echo ""
echo "3. ローカル接続確認（比較用）:"
curl -s http://localhost:3000/api/recruitment/list \
  -H "x-service-token: ${SERVICE_TOKEN}"

echo ""
echo ""
echo "=== テスト完了 ==="
