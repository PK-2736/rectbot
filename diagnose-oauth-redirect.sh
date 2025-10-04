#!/bin/bash

echo "=========================================="
echo "Discord OAuth リダイレクトURI 診断"
echo "=========================================="
echo ""

# 1. .env.production の確認
echo "1. Frontend .env.production の確認:"
echo "---"
if [ -f "frontend/dashboard/.env.production" ]; then
    cat frontend/dashboard/.env.production | grep REDIRECT_URI
else
    echo "❌ .env.production が見つかりません"
fi
echo ""

# 2. wrangler.toml の確認
echo "2. Backend wrangler.toml の確認:"
echo "---"
if [ -f "backend/wrangler.toml" ]; then
    cat backend/wrangler.toml | grep DISCORD_REDIRECT_URI
else
    echo "❌ wrangler.toml が見つかりません"
fi
echo ""

# 3. ソースコード内の使用箇所
echo "3. ソースコード内でのリダイレクトURI使用:"
echo "---"
echo "Frontend (discord-auth.ts):"
grep -A 1 "this.redirectUri" frontend/dashboard/src/lib/discord-auth.ts | head -2
echo ""
echo "Frontend (AdminDashboard.tsx):"
grep "const redirectUri" frontend/dashboard/src/components/AdminDashboard.tsx
echo ""
echo "Backend (index.js):"
grep "env.DISCORD_REDIRECT_URI" backend/index.js | head -1
echo ""

# 4. URLエンコード確認
echo "4. URLエンコードされたリダイレクトURI:"
echo "---"
REDIRECT_URI="https://api.rectbot.tech/api/discord/callback"
ENCODED_URI=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REDIRECT_URI', safe=''))")
echo "元のURI: $REDIRECT_URI"
echo "エンコード後: $ENCODED_URI"
echo ""

# 5. Discord Developer Portal 確認用URL
echo "5. 確認すべき Discord Developer Portal URL:"
echo "---"
echo "https://discord.com/developers/applications/1048950201974542477/oauth2"
echo ""

# 6. テスト用OAuth URL
echo "6. テスト用 OAuth URL:"
echo "---"
CLIENT_ID="1048950201974542477"
TEST_URL="https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${ENCODED_URI}&response_type=code&scope=identify"
echo "$TEST_URL"
echo ""

# 7. チェックリスト
echo "=========================================="
echo "✅ チェックリスト"
echo "=========================================="
echo ""
echo "[ ] Discord Developer Portal で以下が登録されている:"
echo "    https://api.rectbot.tech/api/discord/callback"
echo ""
echo "[ ] .env.production に正しい値が設定されている"
echo ""
echo "[ ] wrangler.toml に正しい値が設定されている"
echo ""
echo "[ ] GitHub Secrets DISCORD_REDIRECT_URI が設定されている"
echo ""
echo "[ ] 再デプロイ済み（Pages & Workers 両方）"
echo ""
echo "=========================================="
echo "🔍 次のステップ"
echo "=========================================="
echo ""
echo "1. 上記のテスト用OAuth URLをブラウザで開く"
echo "2. エラーが出る場合、エラーメッセージを正確に記録"
echo "3. Discord Developer Portal の設定を再確認"
echo "4. 必要に応じて、URIを削除して再登録"
echo ""
