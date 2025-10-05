#!/bin/bash

# Cloudflare Worker環境変数確認スクリプト
# 
# Workerが正しい環境変数でデプロイされているか確認します

echo "🔍 Cloudflare Worker 環境変数チェック"
echo "========================================"
echo ""

echo "1️⃣ ローカルのwrangler.tomlを確認..."
echo "────────────────────────────────────────"
cd backend

echo "VPS_EXPRESS_URL:"
grep "VPS_EXPRESS_URL" wrangler.toml | head -1

echo ""
echo "DISCORD_CLIENT_ID:"
grep "DISCORD_CLIENT_ID" wrangler.toml | head -1

echo ""
echo "ADMIN_DISCORD_ID:"
grep "ADMIN_DISCORD_ID" wrangler.toml | head -1

echo ""
echo "────────────────────────────────────────"
echo ""

echo "2️⃣ デプロイされているWorkerの情報を確認..."
echo "────────────────────────────────────────"

# Workerのデプロイメント履歴を確認
echo "最新のデプロイメント:"
npx wrangler deployments list 2>&1 | head -10

echo ""
echo "────────────────────────────────────────"
echo ""

echo "3️⃣ Workerが実際に使用している環境変数を確認..."
echo "────────────────────────────────────────"
echo ""
echo "ブラウザで以下のURLにアクセスしてください（管理者でログイン後）:"
echo ""
echo "  https://api.rectbot.tech/api/debug/env"
echo ""
echo "期待される出力:"
echo '  {'
echo '    "hasRequiredEnvVars": {'
echo '      "VPS_EXPRESS_URL": true,'
echo '      "DISCORD_CLIENT_ID": true,'
echo '      "ADMIN_DISCORD_ID": true'
echo '    },'
echo '    "tunnelUrlPreview": "https://80cbc750-94a4-4b87-b86d-b3..."'
echo '  }'
echo ""
echo "────────────────────────────────────────"
echo ""

echo "4️⃣ Workerを再デプロイ..."
echo "────────────────────────────────────────"
echo ""
read -p "Workerを今すぐ再デプロイしますか？ (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 デプロイ中..."
    npx wrangler deploy
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ デプロイ成功！"
        echo ""
        echo "5秒後に環境変数を確認します..."
        sleep 5
        echo ""
        echo "📡 環境変数の確認:"
        echo "   https://api.rectbot.tech/api/debug/env"
        echo ""
        echo "管理画面にアクセスして動作を確認してください:"
        echo "   https://dash.rectbot.tech/"
    else
        echo ""
        echo "❌ デプロイに失敗しました"
        echo ""
        echo "トラブルシューティング:"
        echo "  1. Cloudflareにログインしているか確認: npx wrangler whoami"
        echo "  2. ログインが必要な場合: npx wrangler login"
    fi
else
    echo ""
    echo "ℹ️  デプロイをスキップしました"
    echo ""
    echo "手動でデプロイする場合:"
    echo "  cd /workspaces/rectbot/backend"
    echo "  npx wrangler deploy"
fi

cd ..

echo ""
echo "────────────────────────────────────────"
echo ""
echo "📋 次のステップ:"
echo ""
echo "1. https://api.rectbot.tech/api/debug/env で環境変数を確認"
echo "2. VPS上で Tunnel URL へのアクセスをテスト:"
echo "   curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/health"
echo "3. https://dash.rectbot.tech/ で動作確認"
echo ""
