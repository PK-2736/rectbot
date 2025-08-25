#!/bin/bash

echo "=== Appwrite エラー解決ツール ==="
echo ""

# 既存のAppwriteコンテナを確認
echo "🔍 既存のAppwriteコンテナを確認しています..."
existing_containers=$(docker ps -a --filter "name=appwrite" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")

if [ -n "$existing_containers" ]; then
    echo "📦 発見されたAppwriteコンテナ:"
    echo "$existing_containers"
    echo ""
fi

echo "⚠️  解決方法を選択してください:"
echo "1. 完全クリーンアップ + 最小構成で再起動 (推奨)"
echo "2. 完全クリーンアップ + 安定版で再起動"
echo "3. 既存コンテナの削除のみ"
echo "4. ログ確認"
echo "5. キャンセル"
echo ""

read -p "選択 (1-5): " choice

case $choice in
    1)
        echo "🧹 完全クリーンアップを実行しています..."
        
        # すべてのAppwrite関連コンテナを停止・削除
        docker stop $(docker ps -aq --filter "name=appwrite") 2>/dev/null || true
        docker rm -f $(docker ps -aq --filter "name=appwrite") 2>/dev/null || true
        
        # 古いネットワークを削除
        docker network rm $(docker network ls --filter "name=appwrite" -q) 2>/dev/null || true
        
        echo "✅ クリーンアップ完了"
        echo ""
        echo "🚀 最小構成のAppwriteを起動しています..."
        
        # セキュリティキーを生成
        OPENSSL_KEY=$(openssl rand -hex 32)
        
        # 最小構成を使用
        cp docker-compose-minimal.yml docker-compose.yml
        
        # セキュリティキーを設定
        sed -i "s/your-secret-key/$OPENSSL_KEY/g" docker-compose.yml
        
        # 新しいAppwriteを起動
        docker compose up -d
        
        echo "⏳ 起動完了を待機中..."
        sleep 20
        
        echo "📊 起動状況:"
        docker compose ps
        ;;
        
    2)
        echo "🧹 完全クリーンアップを実行しています..."
        
        # すべてのAppwrite関連コンテナを停止・削除
        docker stop $(docker ps -aq --filter "name=appwrite") 2>/dev/null || true
        docker rm -f $(docker ps -aq --filter "name=appwrite") 2>/dev/null || true
        
        echo "✅ クリーンアップ完了"
        echo ""
        echo "🚀 安定版のAppwriteを起動しています..."
        
        # セキュリティキーを生成
        OPENSSL_KEY=$(openssl rand -hex 32)
        EXECUTOR_SECRET=$(openssl rand -hex 32)
        
        # 安定版を使用
        cp docker-compose-stable.yml docker-compose.yml
        
        # セキュリティキーを設定
        sed -i "s/your-secret-key/$OPENSSL_KEY/g" docker-compose.yml
        sed -i "s/your-executor-secret/$EXECUTOR_SECRET/g" docker-compose.yml
        
        # 新しいAppwriteを起動
        docker compose up -d
        
        echo "⏳ 起動完了を待機中..."
        sleep 30
        
        echo "📊 起動状況:"
        docker compose ps
        ;;
        
    3)
        echo "� 既存コンテナを削除しています..."
        docker stop $(docker ps -aq --filter "name=appwrite") 2>/dev/null || true
        docker rm -f $(docker ps -aq --filter "name=appwrite") 2>/dev/null || true
        echo "✅ 削除完了"
        ;;
        
    4)
        echo "📋 Appwriteコンテナのログ:"
        docker logs appwrite 2>/dev/null || echo "メインのappwriteコンテナが見つかりません"
        echo ""
        docker logs appwrite-executor 2>/dev/null || echo "executorコンテナが見つかりません"
        ;;
        
    5)
        echo "❌ キャンセルしました"
        exit 0
        ;;
        
    *)
        echo "❌ 無効な選択です"
        exit 1
        ;;
esac

echo ""
echo "🔧 次に利用可能なコマンド:"
echo "  docker compose up -d         # Appwriteを起動"
echo "  docker compose logs appwrite # ログを確認"
echo "  ./check-server.sh            # サーバー環境チェック"
echo ""
echo "🌐 Appwriteコンソール:"
echo "  https://pwy.rectbot.tech"
