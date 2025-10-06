# Cloudflare Worker 環境変数設定 - 簡易ガイド

## ✅ VPS側の設定完了
- ✅ SERVICE_TOKEN: `rectbot-service-token-2024`
- ✅ Express サーバー: 正常動作
- ✅ Cloudflare Tunnel: 正常接続

## 🔧 次のステップ: Worker設定

### 設定する環境変数

1. **VPS_EXPRESS_URL** (環境変数)
   ```
   https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
   ```

2. **SERVICE_TOKEN** (シークレット)
   ```
   rectbot-service-token-2024
   ```

### Cloudflare Dashboard での設定手順

#### ステップ1: Workerページにアクセス
1. https://dash.cloudflare.com にログイン
2. **Workers & Pages** をクリック
3. **rectbot-backend** を選択

#### ステップ2: 環境変数を追加

1. **Settings** タブをクリック
2. **Variables and Secrets** セクションを探す
3. **Add variable** をクリック

#### ステップ3: VPS_EXPRESS_URLを追加

- **Variable name**: `VPS_EXPRESS_URL`
- **Value**: `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com`
- **Type**: Text (暗号化なし)
- **Save** をクリック

#### ステップ4: SERVICE_TOKENを追加

- **Variable name**: `SERVICE_TOKEN`
- **Value**: `rectbot-service-token-2024`
- **Type**: **Encrypt** (シークレット)
- **Save** をクリック

### 設定確認方法

#### 方法1: Worker Status Endpoint
```bash
curl https://api.rectbot.tech/api/status
```

レスポンス例:
```json
{
  "status": "ok",
  "timestamp": "2025-10-06T...",
  "env": {
    "VPS_EXPRESS_URL": true,
    "SERVICE_TOKEN": true,
    ...
  }
}
```

#### 方法2: Worker Logs
1. Dashboard → Workers → rectbot-backend
2. **Logs** タブをクリック
3. リアルタイムログを確認

### トラブルシューティング

#### 環境変数が反映されない場合

1. **再デプロイ**
   ```bash
   cd backend
   npx wrangler deploy
   ```

2. **キャッシュクリア**
   - ブラウザのキャッシュをクリア
   - 5-10分待つ（Cloudflareの反映時間）

3. **確認**
   ```bash
   curl https://api.rectbot.tech/api/status | jq
   ```

#### それでも503エラーが出る場合

1. Tunnel URLが正しいか確認
2. SERVICE_TOKENが両側で一致しているか確認
3. Worker logsでエラーメッセージを確認

### 完了後の動作確認

```bash
# ダッシュボードにアクセス
https://dash.rectbot.tech

# APIテスト
curl https://api.rectbot.tech/api/recruitment/list \
  -H "Cookie: jwt=your-jwt-token"
```

## 📚 参考資料

- 詳細な設定: `WORKER_ENV_SETUP.md`
- セキュリティ設定: `frontend/dashboard/SECURITY_SETUP.md`
- トラブルシューティング: `503_FIX_GUIDE.md`

## ✨ 設定完了後

すべての設定が完了すると：

1. ✅ Discord botが募集データをRedisに保存
2. ✅ Express APIがRedisからデータ取得
3. ✅ Cloudflare WorkerがExpress APIにプロキシ
4. ✅ ダッシュボードでリアルタイム表示

フローが正常に動作します！