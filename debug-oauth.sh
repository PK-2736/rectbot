#!/bin/bash

echo "🔍 Discord OAuth リダイレクトURI デバッグツール"
echo "=================================================="
echo ""

echo "📝 Step 1: 現在の設定を確認"
echo "----------------------------------------"

echo ""
echo "1️⃣ Backend Worker (wrangler.toml):"
grep -A 1 "DISCORD_REDIRECT_URI" backend/wrangler.toml | head -n 2

echo ""
echo "2️⃣ Frontend Pages (.env.production):"
grep "REDIRECT_URI" frontend/dashboard/.env.production

echo ""
echo "3️⃣ GitHub Secrets で設定されている値:"
echo "   https://github.com/PK-2736/rectbot/settings/secrets/actions"
echo "   で DISCORD_REDIRECT_URI を確認してください"

echo ""
echo "=================================================="
echo ""

echo "🧪 Step 2: 認証フローをテスト"
echo "----------------------------------------"
echo ""
echo "以下の手順でテストしてください:"
echo ""
echo "1. 新しいシークレットウィンドウを開く"
echo "2. https://dash.rectbot.tech にアクセス"
echo "3. 「Discordでログイン」をクリック"
echo "4. Discord で「認証」をクリック"
echo ""
echo "エラーが出た場合:"
echo "  - ブラウザのURLバーに表示されているURL全体をコピー"
echo "  - エラーメッセージをコピー"
echo "  - 両方を教えてください"
echo ""

echo "=================================================="
echo ""

echo "📊 Step 3: Worker ログを確認"
echo "----------------------------------------"
echo ""
echo "別のターミナルで以下を実行してください:"
echo ""
echo "  cd /workspaces/rectbot/backend"
echo "  npx wrangler tail --format pretty"
echo ""
echo "その後、認証を試すとリアルタイムでログが表示されます"
echo ""

echo "=================================================="
echo ""

echo "🚨 最重要: Discord Developer Portal を確認"
echo "----------------------------------------"
echo ""
echo "1. 以下にアクセス:"
echo "   https://discord.com/developers/applications/1048950201974542477/oauth2"
echo ""
echo "2. 「Redirects」セクションを確認"
echo ""
echo "3. 以下が登録されているか確認:"
echo "   https://api.rectbot.tech/api/discord/callback"
echo ""
echo "4. 現在登録されているリダイレクトURIをすべて教えてください"
echo ""

echo "=================================================="
echo ""

echo "✅ チェックリスト:"
echo "  [ ] Discord Developer Portal の Redirects を確認"
echo "  [ ] https://api.rectbot.tech/api/discord/callback が登録されている"
echo "  [ ] 間違ったURIは削除した"
echo "  [ ] 「Save Changes」をクリックした"
echo "  [ ] 5分以上待った"
echo "  [ ] 新しいシークレットウィンドウでテストした"
echo ""
