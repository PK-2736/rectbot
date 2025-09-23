#!/bin/bash

# Supabaseメインシステム セットアップ検証スクリプト
echo "🚀 Supabase メインシステム セットアップ検証を開始します..."
echo ""

# 1. ボット設定確認
echo "📋 1. ボット設定確認"
if [ -f "/workspaces/rectbot/bot/src/config.js" ]; then
    echo "✅ config.js が存在します"
    grep -q "BACKEND_API_URL" /workspaces/rectbot/bot/src/config.js && echo "✅ BACKEND_API_URL 設定OK" || echo "❌ BACKEND_API_URL 設定NG"
else
    echo "❌ config.js が見つかりません"
fi
echo ""

# 2. バックエンドAPI実装確認
echo "📋 2. バックエンドAPI実装確認"
if [ -f "/workspaces/rectbot/backend/index.js" ]; then
    echo "✅ backend/index.js が存在します"
    grep -q "guild_settings" /workspaces/rectbot/backend/index.js && echo "✅ guild_settings API実装済み" || echo "❌ guild_settings API未実装"
    grep -q "/api/guild-settings/start-session" /workspaces/rectbot/backend/index.js && echo "✅ セッション開始API実装済み" || echo "❌ セッション開始API未実装"
    grep -q "/api/guild-settings/finalize" /workspaces/rectbot/backend/index.js && echo "✅ 最終保存API実装済み" || echo "❌ 最終保存API未実装"
    grep -q "migrate-guild-settings" /workspaces/rectbot/backend/index.js && echo "✅ マイグレーションAPI実装済み" || echo "❌ マイグレーションAPI未実装"
else
    echo "❌ backend/index.js が見つかりません"
fi
echo ""

# 3. Supabase SQL確認
echo "📋 3. Supabase SQL確認"
if [ -f "/workspaces/rectbot/supabase_guild_settings_table.sql" ]; then
    echo "✅ Supabase テーブル作成SQLが準備されています"
    grep -q "CREATE TABLE.*guild_settings" /workspaces/rectbot/supabase_guild_settings_table.sql && echo "✅ guild_settingsテーブル定義OK" || echo "❌ テーブル定義NG"
    grep -q "ROW LEVEL SECURITY" /workspaces/rectbot/supabase_guild_settings_table.sql && echo "✅ RLS設定OK" || echo "❌ RLS設定NG"
else
    echo "❌ Supabase SQL ファイルが見つかりません"
fi
echo ""

# 4. ギルド設定コマンド確認
echo "📋 4. ギルド設定コマンド確認"
if [ -f "/workspaces/rectbot/bot/src/commands/guildSettings.js" ]; then
    echo "✅ guildSettings.js が存在します"
    grep -q "finalizeSettings" /workspaces/rectbot/bot/src/commands/guildSettings.js && echo "✅ finalizeSettings実装済み" || echo "❌ finalizeSettings未実装"
    grep -q "startGuildSettingsSession" /workspaces/rectbot/bot/src/commands/guildSettings.js && echo "✅ セッション管理実装済み" || echo "❌ セッション管理未実装"
else
    echo "❌ guildSettings.js が見つかりません"
fi
echo ""

# 5. データベース関数確認
echo "📋 5. データベース関数確認"
if [ -f "/workspaces/rectbot/bot/src/utils/db.js" ]; then
    echo "✅ db.js が存在します"
    grep -q "finalizeGuildSettings" /workspaces/rectbot/bot/src/utils/db.js && echo "✅ finalizeGuildSettings実装済み" || echo "❌ finalizeGuildSettings未実装"
    grep -q "startGuildSettingsSession" /workspaces/rectbot/bot/src/utils/db.js && echo "✅ startGuildSettingsSession実装済み" || echo "❌ startGuildSettingsSession未実装"
else
    echo "❌ db.js が見つかりません"
fi
echo ""

echo "🎯 セットアップ検証完了！"
echo ""
echo "📋 次の手順を手動で実行してください："
echo "1. Supabaseダッシュボードで以下のSQLを実行："
echo "   cat /workspaces/rectbot/supabase_guild_settings_table.sql"
echo ""
echo "2. Cloudflare Workersにバックエンドをデプロイ："
echo "   cd /workspaces/rectbot/backend && npx wrangler deploy"
echo ""
echo "3. ボットを再起動："
echo "   cd /workspaces/rectbot/bot && npm run restart"
echo ""
echo "4. データ移行を実行（必要に応じて）："
echo "   curl -X POST https://api.rectbot.tech/api/admin/migrate-guild-settings"
echo ""
echo "5. データ状況確認："
echo "   curl https://api.rectbot.tech/api/admin/data-status"