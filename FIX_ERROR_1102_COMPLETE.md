# エラー1102の根本原因と解決

## 🔍 診断結果の分析

VPSの診断結果から：
- ✅ Cloudflare Tunnel: 正常動作（4接続）
- ✅ Expressサーバー: 正常動作（ポート3000でリッスン中）
- ✅ ローカル接続: 成功（`[]` レスポンス）
- ❓ Tunnel経由接続: **テスト失敗**（出力が `2xkix05` のみ）

## 🎯 根本原因

Cloudflare WorkerにGitHub Secretsから環境変数が正しく渡されていない可能性があります。

## ✅ 解決手順

### ステップ1: GitHub Secretsの確認

https://github.com/PK-2736/rectbot/settings/secrets/actions にアクセスして、以下が設定されているか確認：

- [ ] `CLOUDFLARE_API_TOKEN`
- [ ] `CLOUDFLARE_ACCOUNT_ID`
- [ ] `VPS_EXPRESS_URL` ← **重要！**
- [ ] `SERVICE_TOKEN` ← **重要！**
- [ ] `DISCORD_CLIENT_ID`
- [ ] `DISCORD_CLIENT_SECRET`
- [ ] `DISCORD_REDIRECT_URI`
- [ ] `JWT_SECRET`
- [ ] `ADMIN_DISCORD_ID`

**特に重要な2つ:**

```
Name: VPS_EXPRESS_URL
Value: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com

Name: SERVICE_TOKEN
Value: rectbot-service-token-2024
```

### ステップ2: VPSでTunnel接続テスト

```bash
# VPSで実行
cd ~/rectbot

# Tunnel経由でAPIにアクセス
curl -v https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"

# 期待される結果:
# < HTTP/2 200
# []
```

もし503エラーが出る場合、Expressサーバーを再起動：

```bash
pm2 restart rectbot-server
pm2 logs rectbot-server --lines 20
```

### ステップ3: GitHub Actionsで再デプロイ

GitHub Secretsを更新したら、再デプロイが必要です：

```powershell
# ローカルで実行（Windows）
git add .
git commit -m "Trigger redeploy with correct secrets" --allow-empty
git push origin main
```

または、GitHub Actionsページから手動トリガー：
https://github.com/PK-2736/rectbot/actions/workflows/deploy-cloudflare-workers.yml

### ステップ4: Worker Logsで確認

1. https://dash.cloudflare.com → Workers & Pages → rectbot-backend
2. **Logs** タブをクリック
3. リアルタイムログを確認
4. `VPS_EXPRESS_URL` と `SERVICE_TOKEN` が設定されているか確認

### ステップ5: ブラウザで動作確認

```powershell
start https://dash.rectbot.tech
```

エラー1102が消えていれば成功です！

---

## 🐛 それでもエラーが出る場合

### 確認ポイント1: Worker環境変数の直接確認

Cloudflare Dashboard で直接確認：

1. https://dash.cloudflare.com → Workers & Pages
2. **rectbot-backend** → Settings → Variables and Secrets
3. `VPS_EXPRESS_URL` と `SERVICE_TOKEN` が表示されているか

もし表示されていなければ、手動で追加：

```
Variable name: VPS_EXPRESS_URL
Value: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
Type: Text

Variable name: SERVICE_TOKEN
Value: rectbot-service-token-2024  
Type: Encrypt (シークレット)
```

### 確認ポイント2: GitHub Actionsのワークフローログ

https://github.com/PK-2736/rectbot/actions で最新のワークフロー実行を確認：

- "Ensure wrangler secrets" ステップが成功しているか
- "Deploy to Cloudflare Workers" ステップが成功しているか
- エラーメッセージがないか

### 確認ポイント3: Tunnel URLの形式

正しい形式：
```
https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
```

間違った形式（これらはNG）：
- `http://...` （HTTPSが必要）
- `.../` （末尾のスラッシュ不要）
- `2xkix05` （これはlocation名で、URLではない）

---

## ✅ 成功時の状態

### VPS側:
```bash
# PM2
pm2 list
# → rectbot: online
# → rectbot-server: online

# ローカル接続
curl http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
# → []

# Tunnel接続
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
# → []
```

### Worker側:
```powershell
# ブラウザでアクセス
start https://dash.rectbot.tech
# → データ取得エラーが消える
# → "導入サーバー数: 0" と表示される（正常）
```

### Worker Logs:
```
Proxying to Express API: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list
Express API responded with status: 200
Fetched 0 recruitments from Express API
```

---

## 📝 チェックリスト

完全な解決までのステップ：

1. [ ] GitHub Secretsに `VPS_EXPRESS_URL` と `SERVICE_TOKEN` を追加
2. [ ] VPSでTunnel接続テストを実行（`bash test_tunnel_connection.sh`）
3. [ ] GitHub Actionsで再デプロイ
4. [ ] Worker Logsで環境変数が設定されているか確認
5. [ ] ブラウザで `https://dash.rectbot.tech` にアクセス
6. [ ] エラー1102が消えたことを確認

すべてチェックできれば、完全に動作します！🎉
