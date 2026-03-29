/**
 * 画像が読み込めないことの考えられる原因
 */

console.log(`
=== 画像読み込み失敗の原因チェックリスト ===

【優先順位 高】
□ 1. テンプレートに background_asset_key がない
      → DB確認: SELECT name, background_asset_key FROM templates WHERE guild_id = '...';

□ 2. Asset Key のフォーマットが間違っている
      → 期待値: plus-templates/{guildId}/{timestamp}-{name}.{ext}
      → 実際: ?

□ 3. Backend API が R2 から取得できていない
      → テスト: curl -v https://api.recrubo.net/api/plus/assets/plus-templates/...

□ 4. R2 バケットにファイルが存在しない
      → テスト: wrangler r2 object list recrubo-plus-templates

□ 5. Bot が Backend API に到達できない（ネットワーク問題）
      → テスト: ping api.recrubo.net / curl -I https://api.recrubo.net

【優先順位 中】
□ 6. Content-Type が image/* でない
      → テスト: curl -I https://api.recrubo.net/api/plus/assets/...

□ 7. Canvas の loadImage() でのタイムアウト
      → ログ: "[canvasRecruit] failed to load template full background image"

□ 8. CORS または認証エラー
      → ログ: "403 Forbidden" または "401 Unauthorized"

【優先順位 低】
□ 9. 画像ファイルが破損している
      → テスト: ローカルで画像ダウンロードして確認

□ 10. Canvas ネイティブライブラリが足りない
       → テスト: npm rebuild canvas

=== OCI での確認コマンド ===
# 1. 環境確認
echo "BACKEND_API_URL: $BACKEND_API_URL"

# 2. 最新ログ表示
pm2 logs rectbot-server --lines 50

# 3. 特定ダイトのログフィルタ
pm2 logs rectbot-server | grep -i "image\\|asset\\|failed\\|error" 

# 4. テンプレート DB 確認
psql $SUPABASE_URL -c "SELECT name, background_asset_key, updated_at FROM templates LIMIT 5;"

# 5. 実際のアセット URL をテスト
curl -I https://api.recrubo.net/api/plus/assets/plus-templates/{guildId}/{filename}

# 6. R2 の内容確認
wrangler r2 object list recrubo-plus-templates | head -10
`);
