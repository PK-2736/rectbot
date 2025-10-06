# Cloudflare Worker 環境変数設定ガイド

## 現在の問題

診断結果から、以下の問題が確認されました：

1. **SERVICE_TOKEN の不一致** - Express サーバーが認証を拒否
2. **Tunnel URL** - Worker に正しい URL を設定する必要あり

## 設定する環境変数

### Cloudflare Dashboard で設定

1. Cloudflare Dashboard にアクセス
2. Workers & Pages → rectbot-backend を選択
3. Settings → Variables に移動

### 必要な変数

#### VPS_EXPRESS_URL (環境変数)
```
Name: VPS_EXPRESS_URL
Value: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
Type: Text (暗号化なし)
```

#### SERVICE_TOKEN (シークレット)
```
Name: SERVICE_TOKEN
Value: rectbot-service-token-2024
Type: Secret (暗号化あり)
```

## 設定手順

### 方法1: Cloudflare Dashboard (推奨)

1. **Variables セクションに移動**
   - Workers & Pages → rectbot-backend
   - Settings タブ → Variables

2. **VPS_EXPRESS_URL を追加**
   - "Add variable" をクリック
   - Variable name: `VPS_EXPRESS_URL`
   - Value: `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com`
   - Type: "Text" を選択
   - "Save" をクリック

3. **SERVICE_TOKEN を追加/更新**
   - "Add variable" をクリック
   - Variable name: `SERVICE_TOKEN`
   - Value: `rectbot-service-token-2024`
   - Type: "Encrypt" を選択（シークレット）
   - "Save" をクリック

4. **デプロイ**
   - 変数を保存後、自動的に新しいデプロイが開始されます
   - または、手動で再デプロイ

### 方法2: Wrangler CLI

```bash
cd ~/rectbot/backend

# SERVICE_TOKEN をシークレットとして設定
echo "rectbot-service-token-2024" | npx wrangler secret put SERVICE_TOKEN

# VPS_EXPRESS_URL を環境変数として設定
# wrangler.toml に追加するか、Dashboard で設定
```

## 確認方法

### 1. Worker ログを確認

```bash
# ローカルで確認
cd ~/rectbot/backend
npx wrangler tail
```

### 2. API エンドポイントをテスト

```bash
# Worker の status エンドポイント
curl https://api.rectbot.tech/api/status

# 環境変数が設定されているか確認
# レスポンスに VPS_EXPRESS_URL と SERVICE_TOKEN (true/false) が表示される
```

### 3. ダッシュボードから確認

https://dash.rectbot.tech にアクセスして、データが正しく取得できるか確認

## トラブルシューティング

### SERVICE_TOKEN が反映されない

1. Dashboard で "Encrypt" タイプで保存されているか確認
2. Worker を再デプロイ
3. ブラウザのキャッシュをクリア

### Tunnel URL が反映されない

1. URL が正しいか確認（https:// で始まり、.cfargotunnel.com で終わる）
2. Worker を再デプロイ
3. 数分待ってから再試行

### それでも 503 エラーが出る

1. VPS 側の SERVICE_TOKEN が正しいか確認
   ```bash
   cd ~/rectbot/bot
   grep SERVICE_TOKEN .env
   ```

2. Express サーバーを再起動
   ```bash
   pm2 restart rectbot-server
   ```

3. Worker のログを確認
   ```bash
   # Dashboard → Workers → rectbot-backend → Logs
   ```

## 設定後の期待される動作

1. ブラウザ → Worker: JWT Cookie で認証
2. Worker → Express: SERVICE_TOKEN で認証
3. Express → Redis: ローカル接続
4. データが正常に取得・表示される

## 参考リンク

- [Cloudflare Workers Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)