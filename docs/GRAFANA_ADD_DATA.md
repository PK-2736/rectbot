#!/bin/bash
# Discordボットを使って募集を作成する手順ガイド

cat << 'EOF'
📋 Grafanaに募集データを表示する方法
==========================================

方法1: Discordボットで募集を作成（推奨）
----------------------------------------
1. Discordサーバーに移動
2. 以下のコマンドを実行:
   /game-recruit

3. モーダルで以下を入力:
   - タイトル: 例）APEX ランク募集 @1
   - ゲーム: Apex Legends
   - プラットフォーム: PC / PS5 / Switch など
   - 最大人数: 3
   - VC使用: はい / いいえ
   - 開始時間: 2025-11-02T20:00 など

4. 送信すると自動的にDurable Objectsに保存される
5. 30秒以内にGrafanaに反映される


方法2: APIから直接追加（開発/テスト用）
----------------------------------------
スクリプトを使用:
  cd ~/rectbot
  export SERVICE_TOKEN="your-service-token-here"
  ./scripts/add-test-recruit.sh

または手動でcurl:
   curl -X POST https://api.recrubo.net/api/recruits \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SERVICE_TOKEN" \
    -d '{
         "recruitId": "test-12345",
      "title": "テスト募集",
      "game": "Apex Legends",
      "platform": "PC",
      "currentMembers": 1,
      "maxMembers": 3,
      "voice": true,
      "ownerId": "test-user"
    }'


方法3: 既存の募集データを確認
----------------------------------------
現在のデータを確認:
  curl -X POST https://api.recrubo.net/api/grafana/recruits \
    -H "Content-Type: application/json" \
    -d '{}' | jq

メトリクスを確認:
  curl https://api.recrubo.net/metrics


Grafanaでの確認方法
----------------------------------------
1. https://grafana.recrubo.net にアクセス
2. Dashboards → 📋 募集状況ダッシュボード
3. 以下が表示される:
   - 🎮 アクティブな募集数
   - 👥 参加者総数
   - 📊 総募集数
   - 📈 募集トレンドグラフ
   - 📋 アクティブな募集一覧テーブル

自動更新: 30秒ごとに最新データに更新


トラブルシューティング
----------------------------------------
データが表示されない場合:
1. バックエンドが正常にデプロイされているか確認
   cd ~/rectbot/backend && wrangler deploy

2. エンドポイントが応答するか確認
   curl https://api.recrubo.net/metrics

3. Grafanaを再起動
   docker compose -f docker-compose.monitoring.yml restart grafana

4. データソースが正しく設定されているか確認
   Grafana → Configuration → Data Sources → Cloudflare-Recruits-API
   - URL: https://api.recrubo.net
   - Allowed hosts: api.recrubo.net を追加
   - Save & Test で OK になることを確認


注意事項
----------------------------------------
- 募集データは8時間で自動的に期限切れになります
- Durable Objectsはエフェメラルストレージのため、
  Workerの再起動でデータが消える可能性があります
- 本番環境では必ずDiscordボット経由で作成してください

==========================================
EOF
