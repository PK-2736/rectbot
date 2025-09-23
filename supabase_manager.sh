#!/bin/bash

# Supabaseメインシステム 管理ツール
echo "🛠️  RectBot Supabase管理ツール"
echo "================================="
echo ""

case "$1" in
    "status")
        echo "📊 システム状況確認中..."
        if command -v curl &> /dev/null; then
            echo "KV vs Supabase データ状況:"
            curl -s https://api.rectbot.tech/api/admin/data-status | jq '.' 2>/dev/null || curl -s https://api.rectbot.tech/api/admin/data-status
        else
            echo "❌ curl が見つかりません"
        fi
        ;;
    "migrate")
        echo "🔄 データ移行実行中..."
        if command -v curl &> /dev/null; then
            echo "KV → Supabase データ移行:"
            curl -X POST -s https://api.rectbot.tech/api/admin/migrate-guild-settings | jq '.' 2>/dev/null || curl -X POST -s https://api.rectbot.tech/api/admin/migrate-guild-settings
        else
            echo "❌ curl が見つかりません"
        fi
        ;;
    "deploy")
        echo "🚀 バックエンドデプロイ実行中..."
        cd /workspaces/rectbot/backend
        npx wrangler deploy
        ;;
    "restart")
        echo "🔄 ボット再起動中..."
        cd /workspaces/rectbot/bot
        if [ -f "package.json" ]; then
            npm run restart 2>/dev/null || pm2 restart rectbot 2>/dev/null || echo "❌ 再起動コマンドが見つかりません"
        else
            echo "❌ package.json が見つかりません"
        fi
        ;;
    "sql")
        echo "📋 Supabase実行用SQL:"
        echo "========================"
        cat /workspaces/rectbot/supabase_guild_settings_table.sql
        echo "========================"
        echo "💡 上記SQLをSupabaseのSQL Editorにコピペして実行してください"
        ;;
    "test")
        echo "🧪 簡易テスト実行中..."
        echo ""
        echo "1. ファイル存在確認:"
        [ -f "/workspaces/rectbot/bot/src/commands/guildSettings.js" ] && echo "✅ guildSettings.js" || echo "❌ guildSettings.js"
        [ -f "/workspaces/rectbot/backend/index.js" ] && echo "✅ backend/index.js" || echo "❌ backend/index.js"
        [ -f "/workspaces/rectbot/supabase_guild_settings_table.sql" ] && echo "✅ SQL作成ファイル" || echo "❌ SQL作成ファイル"
        echo ""
        echo "2. 実装確認:"
        grep -q "finalizeGuildSettings" /workspaces/rectbot/bot/src/utils/db.js && echo "✅ DB関数実装済み" || echo "❌ DB関数未実装"
        grep -q "guild_settings" /workspaces/rectbot/backend/index.js && echo "✅ API実装済み" || echo "❌ API未実装"
        ;;
    *)
        echo "使用方法:"
        echo "  $0 status    - システム状況確認"
        echo "  $0 migrate   - データ移行実行"
        echo "  $0 deploy    - バックエンドデプロイ"
        echo "  $0 restart   - ボット再起動"
        echo "  $0 sql       - Supabase実行用SQL表示"
        echo "  $0 test      - 簡易テスト"
        echo ""
        echo "例:"
        echo "  $0 status     # 現在の状況確認"
        echo "  $0 migrate    # 既存データをKVからSupabaseに移行"
        ;;
esac