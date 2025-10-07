#!/bin/bash

echo "=== Cloudflare Worker 環境変数確認スクリプト ==="
echo ""
echo "このスクリプトは、Workerが正しく環境変数を受け取っているか確認します"
echo ""

# api.rectbot.tech の /api/status にアクセス
echo "1. Worker Status API にアクセス:"
echo "   URL: https://api.rectbot.tech/api/status"
echo ""

# curlでアクセス（-kオプションでSSL検証をスキップ）
STATUS_RESPONSE=$(curl -k -s https://api.rectbot.tech/api/status 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ 接続成功"
    echo ""
    echo "レスポンス:"
    echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
    echo ""
    
    # VPS_EXPRESS_URL と SERVICE_TOKEN が true かチェック
    VPS_EXPRESS_CHECK=$(echo "$STATUS_RESPONSE" | jq -r '.env.VPS_EXPRESS_URL // empty' 2>/dev/null)
    SERVICE_TOKEN_CHECK=$(echo "$STATUS_RESPONSE" | jq -r '.env.SERVICE_TOKEN // empty' 2>/dev/null)
    
    echo "環境変数チェック:"
    if [ "$VPS_EXPRESS_CHECK" = "true" ]; then
        echo "  ✅ VPS_EXPRESS_URL: 設定済み"
    else
        echo "  ❌ VPS_EXPRESS_URL: 未設定または false"
    fi
    
    if [ "$SERVICE_TOKEN_CHECK" = "true" ]; then
        echo "  ✅ SERVICE_TOKEN: 設定済み"
    else
        echo "  ❌ SERVICE_TOKEN: 未設定または false"
    fi
else
    echo "❌ 接続失敗 (終了コード: $EXIT_CODE)"
    echo "エラー: $STATUS_RESPONSE"
fi

echo ""
echo "=== 確認完了 ==="
echo ""
echo "対処方法:"
echo "1. 環境変数が未設定の場合:"
echo "   - GitHub Secretsを確認: https://github.com/PK-2736/rectbot/settings/secrets/actions"
echo "   - VPS_EXPRESS_URL と SERVICE_TOKEN を追加"
echo "   - 再デプロイ: git commit --allow-empty -m 'redeploy' && git push"
echo ""
echo "2. SSL証明書エラーが出る場合:"
echo "   - Cloudflare Dashboard → Workers & Pages → rectbot-backend"
echo "   - Settings → Triggers → Custom Domains"
echo "   - api.rectbot.tech を追加"
