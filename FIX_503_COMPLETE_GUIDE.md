# エラー503完全解決ガイド

## 🔍 現状

- ❌ ダッシュボード: "Failed to fetch: 503 - VPS Express サーバーに接続できません"
- ✅ VPS側: ExpressサーバーとTunnelは正常動作
- ❓ Worker側: 環境変数が正しく設定されているか不明

## 📝 完全チェックリスト

### ステップ1: GitHub Actionsのデプロイログを確認

https://github.com/PK-2736/rectbot/actions

最新のワークフロー実行で以下を確認：

1. ✅ すべてのステップが成功（緑チェック）
2. "Deploy to Cloudflare Workers" ステップのログに以下が表示されているか：

```
Deploying with environment variables:
  DISCORD_CLIENT_ID: set
  DISCORD_REDIRECT_URI: https://api.rectbot.tech/api/discord/callback
  VPS_EXPRESS_URL: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
  ADMIN_DISCORD_ID: set
```

**もしこのログが無い、またはVPS_EXPRESS_URLが空の場合:**

→ GitHub Secretsが正しく設定されていません（ステップ2へ）

### ステップ2: GitHub Secretsを確認

https://github.com/PK-2736/rectbot/settings/secrets/actions

以下のSecretsが存在するか確認：

```
必須:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID
- VPS_EXPRESS_URL          ← 重要！
- SERVICE_TOKEN            ← 重要！
- DISCORD_CLIENT_ID
- DISCORD_CLIENT_SECRET
- DISCORD_REDIRECT_URI
- JWT_SECRET
- ADMIN_DISCORD_ID

オプション:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
```

**VPS_EXPRESS_URL または SERVICE_TOKEN が無い場合:**

追加してください：

```
Name: VPS_EXPRESS_URL
Value: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com

Name: SERVICE_TOKEN
Value: rectbot-service-token-2024
```

### ステップ3: Workerの環境変数を確認

#### 方法A: VPSから確認（推奨）

```bash
# VPSで実行
cd ~/rectbot
bash check_worker_env.sh
```

期待される出力:
```
✅ VPS_EXPRESS_URL: 設定済み
✅ SERVICE_TOKEN: 設定済み
```

#### 方法B: ブラウザで確認

1. ブラウザで開く: `https://api.rectbot.tech/api/status`
2. SSL警告が出たら「詳細設定」→「安全でないサイトに進む」
3. JSONレスポンスを確認:

```json
{
  "status": "ok",
  "env": {
    "VPS_EXPRESS_URL": true,  ← これが true であること
    "SERVICE_TOKEN": true,     ← これが true であること
    ...
  }
}
```

**false または存在しない場合:**

→ Workerに環境変数が設定されていません（ステップ4へ）

### ステップ4: Cloudflare Dashboardで直接確認

https://dash.cloudflare.com

1. **Workers & Pages** をクリック
2. **rectbot-backend** を選択
3. **Settings** → **Variables and Secrets**

**以下が表示されているか確認:**

**Variables（平文）:**
- `VPS_EXPRESS_URL`: `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com`

**Secrets（暗号化）:**
- `SERVICE_TOKEN`: `********` （値は表示されない）

**もし表示されていない場合:**

手動で追加：

```
Variable name: VPS_EXPRESS_URL
Value: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
Type: Text

Variable name: SERVICE_TOKEN
Value: rectbot-service-token-2024
Type: Encrypt
```

追加後、5分ほど待ってから再テスト。

### ステップ5: 再デプロイ

GitHub Secretsを更新した場合、再デプロイが必要：

```powershell
# Windowsで実行
git commit --allow-empty -m "Trigger redeploy with updated secrets"
git push origin main
```

GitHub Actionsの実行を確認：
https://github.com/PK-2736/rectbot/actions

すべてのステップが成功するまで待つ（2-3分）。

### ステップ6: ダッシュボードで再確認

```powershell
# ブラウザキャッシュをクリア
Ctrl + Shift + Delete

# またはシークレットモードで開く
start msedge -inprivate https://dash.rectbot.tech
```

**成功時の表示:**
```
導入サーバー数: 0
総募集数: 0
```

**エラーが消えれば成功です！** ✅

---

## 🐛 それでもエラーが出る場合

### 確認A: VPS側の診断

```bash
# VPSで実行
cd ~/rectbot

# PM2プロセス
pm2 list
# → rectbot-server: online であること

# ローカル接続
curl http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
# → [] が返ること

# Tunnel接続
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
# → [] が返ること

# Cloudflared
sudo systemctl status cloudflared
# → Active: active (running) であること
```

**どこかで失敗する場合:**

```bash
# 完全再起動
pm2 restart all
sudo systemctl restart cloudflared

# ログ確認
pm2 logs rectbot-server --lines 50
```

### 確認B: Worker Logs

https://dash.cloudflare.com

1. Workers & Pages → rectbot-backend
2. **Logs** タブをクリック
3. リアルタイムログを確認

**エラーメッセージ例:**

```
❌ Error: SERVICE_TOKEN not configured
→ GitHub Secretsに SERVICE_TOKEN を追加

❌ Error: fetch failed to https://80cbc750...
→ VPS側のExpressサーバーまたはTunnelが停止している

❌ Error: 401 Unauthorized
→ SERVICE_TOKENの値が一致していない
```

### 確認C: 環境変数の値を直接確認

**VPS側（bot/.env）:**
```bash
cat ~/rectbot/bot/.env | grep SERVICE_TOKEN
# 期待: SERVICE_TOKEN=rectbot-service-token-2024
```

**GitHub Secrets:**
- `SERVICE_TOKEN` の値が `rectbot-service-token-2024` であること

**Cloudflare Dashboard:**
- `SERVICE_TOKEN` シークレットが存在すること

**すべて一致していることを確認してください！**

---

## ✅ 最終確認チェックリスト

すべてにチェックが入れば、完全に動作します：

### GitHub側:
- [ ] GitHub Secretsに `VPS_EXPRESS_URL` が設定されている
- [ ] GitHub Secretsに `SERVICE_TOKEN` が設定されている
- [ ] 最新のGitHub Actionsが成功している
- [ ] デプロイログに環境変数が表示されている

### Cloudflare側:
- [ ] Worker Settings に `VPS_EXPRESS_URL` が表示されている
- [ ] Worker Settings に `SERVICE_TOKEN` が表示されている
- [ ] `/api/status` で両方が `true` になっている
- [ ] Worker Logsにエラーが出ていない

### VPS側:
- [ ] `pm2 list` で rectbot-server が online
- [ ] ローカル接続テストが成功（`[]` 返却）
- [ ] Tunnel接続テストが成功（`[]` 返却）
- [ ] cloudflared が active (running)

### ブラウザ側:
- [ ] `https://dash.rectbot.tech` でエラーが出ない
- [ ] "導入サーバー数: 0" と表示される
- [ ] DevToolsにエラーが無い

**すべてチェックできれば完璧です！** 🎉

---

## 📞 サポート情報

それでも解決しない場合、以下の情報を共有してください：

1. GitHub Actions の最新ワークフローログ（Deploy ステップ）
2. `bash check_worker_env.sh` の実行結果（VPS）
3. Cloudflare Worker Logs のスクリーンショット
4. VPS診断結果:
   - `pm2 list`
   - `curl localhost:3000/api/recruitment/list -H "x-service-token: rectbot-service-token-2024"`
   - `curl https://80cbc750.../api/recruitment/list -H "x-service-token: rectbot-service-token-2024"`

より詳細な診断ができます！
