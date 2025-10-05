#!/bin/bash

# Cloudflare Workers デプロイスクリプト（環境変数付き）
# 
# 使用方法: ./deploy-worker-with-env.sh
#
# このスクリプトは以下を実行します:
# 1. 必要な環境変数をCloudflare Workersに設定
# 2. Workerをデプロイ

set -e

echo "🚀 Cloudflare Workers デプロイ準備..."
echo ""

cd backend

# 環境変数の確認
echo "📝 必要な環境変数を確認しています..."
echo ""

# 必須の環境変数リスト
REQUIRED_VARS=(
  "DISCORD_CLIENT_ID"
  "DISCORD_REDIRECT_URI"
  "VPS_EXPRESS_URL"
  "ADMIN_DISCORD_ID"
  "SUPABASE_URL"
)

# シークレットリスト
REQUIRED_SECRETS=(
  "DISCORD_CLIENT_SECRET"
  "JWT_SECRET"
  "SERVICE_TOKEN"
  "SUPABASE_SERVICE_ROLE_KEY"
)

# 環境変数の存在確認
missing_vars=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

# シークレットの存在確認（実際の値は確認できないため警告のみ）
echo "⚠️  以下のシークレットが設定されているか確認してください:"
for secret in "${REQUIRED_SECRETS[@]}"; do
  echo "   - $secret"
done
echo ""

if [ ${#missing_vars[@]} -ne 0 ]; then
  echo "❌ 以下の環境変数が未設定です:"
  for var in "${missing_vars[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "📚 環境変数の設定方法:"
  echo ""
  echo "1. 以下の値を使用して環境変数を設定してください:"
  echo ""
  echo "   export DISCORD_CLIENT_ID=\"1048950201974542477\""
  echo "   export DISCORD_REDIRECT_URI=\"https://api.rectbot.tech/api/discord/callback\""
  echo "   export VPS_EXPRESS_URL=\"https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com\""
  echo "   export ADMIN_DISCORD_ID=\"726195003780628621\""
  echo "   export SUPABASE_URL=\"YOUR_SUPABASE_URL\""
  echo ""
  echo "2. または、.env ファイルを作成して source してください:"
  echo ""
  echo "   source .env"
  echo ""
  exit 1
fi

# デプロイオプションの構築
DEPLOY_CMD="wrangler deploy"

# 環境変数を --var オプションで追加
DEPLOY_CMD="$DEPLOY_CMD --var DISCORD_CLIENT_ID:${DISCORD_CLIENT_ID}"
DEPLOY_CMD="$DEPLOY_CMD --var DISCORD_REDIRECT_URI:${DISCORD_REDIRECT_URI}"
DEPLOY_CMD="$DEPLOY_CMD --var VPS_EXPRESS_URL:${VPS_EXPRESS_URL}"
DEPLOY_CMD="$DEPLOY_CMD --var ADMIN_DISCORD_ID:${ADMIN_DISCORD_ID}"
DEPLOY_CMD="$DEPLOY_CMD --var SUPABASE_URL:${SUPABASE_URL}"

echo "✅ すべての必須環境変数が設定されています"
echo ""
echo "🔐 シークレットの設定状態を確認..."
echo ""

# シークレット一覧を取得
echo "現在設定されているシークレット:"
wrangler secret list || echo "シークレット一覧の取得に失敗しました"
echo ""

# シークレットが未設定の場合の警告
echo "⚠️  以下のコマンドでシークレットを設定してください（未設定の場合）:"
echo ""
echo "   wrangler secret put DISCORD_CLIENT_SECRET"
echo "   wrangler secret put JWT_SECRET"
echo "   wrangler secret put SERVICE_TOKEN"
echo "   wrangler secret put SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "推奨値:"
echo "   - DISCORD_CLIENT_SECRET: Discord Developer Portalから取得"
echo "   - JWT_SECRET: T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM="
echo "   - SERVICE_TOKEN: openssl rand -base64 32 で生成"
echo "   - SUPABASE_SERVICE_ROLE_KEY: Supabase Dashboardから取得"
echo ""

read -p "シークレットは設定済みですか？ (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ シークレットを設定してから再度実行してください"
  exit 1
fi

echo "📦 Workerをデプロイしています..."
echo ""
echo "実行コマンド: $DEPLOY_CMD"
echo ""

# デプロイ実行
eval $DEPLOY_CMD

echo ""
echo "✅ デプロイ完了！"
echo ""
echo "🔍 デバッグ情報:"
echo "   https://api.rectbot.tech/api/debug/env にアクセスして環境変数を確認してください"
echo ""
echo "🌐 管理画面:"
echo "   https://dash.rectbot.tech/"
echo ""
