# Cloudflare Tunnel 接続テストガイド

## 🔍 現状確認

### ローカル（Windows）からの接続テスト結果:
- ❌ DNS解決失敗: `*.cfargotunnel.com` が解決できない
- ✅ IPv6アドレスは存在: `fd10:aec2:5dae::`
- ❌ IPv4アドレス: なし

## 📝 これは正常です！

**Cloudflare Tunnelの仕組み:**

1. `*.cfargotunnel.com` は **Cloudflareのネットワーク内部**でのみアクセス可能
2. 一般のインターネットからは直接アクセス**できません**
3. Cloudflare Worker（Cloudflareのネットワーク内）からは**アクセス可能**

つまり：
- ✅ VPS → Tunnel: 可能（同じネットワーク内）
- ✅ Cloudflare Worker → Tunnel: 可能（Cloudflareネットワーク内）
- ❌ ローカルPC → Tunnel: 不可能（外部ネットワーク）
- ✅ ローカルPC → Worker → Tunnel: 可能（Workerを経由）

これは**セキュリティ上望ましい設計**です！

## ✅ 正しい接続フロー

```
ブラウザ (Windows)
    ↓
api.rectbot.tech (Cloudflare Worker)
    ↓
*.cfargotunnel.com (Cloudflare Tunnel)
    ↓
localhost:3000 (VPS Express Server)
    ↓
Redis
```

## 🔧 Workerが正しく動作しているか確認

### 方法1: Worker Status APIで確認

```powershell
# PowerShellで実行（ただしSSLエラーが出る可能性あり）
curl https://api.rectbot.tech/api/status

# または、ブラウザで開く
start https://api.rectbot.tech/api/status
```

期待されるレスポンス:
```json
{
  "status": "ok",
  "timestamp": "2025-10-07T...",
  "env": {
    "VPS_EXPRESS_URL": true,
    "SERVICE_TOKEN": true,
    "DISCORD_CLIENT_ID": true,
    ...
  }
}
```

### 方法2: Dashboard経由で確認

```powershell
start https://dash.rectbot.tech
```

エラー1102が出なくなっていれば、Worker → Tunnel → Express の接続は成功しています。

## 🐛 トラブルシューティング

### エラー: "SSL/TLS のセキュリティで保護されているチャネルに対する信頼関係を確立できませんでした"

**原因:** `api.rectbot.tech` のSSL証明書設定が不完全

**解決方法:**

#### オプション1: Cloudflare Dashboard でCustom Domainを追加

1. https://dash.cloudflare.com → Workers & Pages
2. rectbot-backend → Settings → Triggers
3. Custom Domains → **Add Custom Domain**
4. `api.rectbot.tech` を入力 → Add Domain
5. 5-15分待つ

#### オプション2: 一時的にworkers.devを使用

wrangler.tomlを変更:
```toml
workers_dev = true  # これをtrueに変更
```

再デプロイ:
```powershell
cd backend
npx wrangler deploy
```

これで `https://rectbot-backend.workers.dev` でアクセス可能になります。

### エラー: "Failed to fetch: 503 - VPS Express サーバーに接続できません"

**原因:** GitHub Secretsに環境変数が設定されていない

**解決方法:**

1. https://github.com/PK-2736/rectbot/settings/secrets/actions
2. 以下のSecretsを追加:
   - `VPS_EXPRESS_URL`: `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com`
   - `SERVICE_TOKEN`: `rectbot-service-token-2024`
3. 再デプロイ:
   ```powershell
   git commit --allow-empty -m "Trigger redeploy"
   git push origin main
   ```

## ✅ 成功時の動作

すべて正常に動作している場合:

1. ✅ `https://dash.rectbot.tech` にアクセス
2. ✅ 「データ取得エラー」が表示されない
3. ✅ 「導入サーバー数: 0」と表示される
4. ✅ 「総募集数: 0」と表示される
5. ✅ Discord認証が正常に動作する

## 📊 接続確認チェックリスト

VPS側:
- [ ] `pm2 list` で rectbot-server が online
- [ ] `curl http://localhost:3000/api/recruitment/list -H "x-service-token: rectbot-service-token-2024"` が `[]` を返す
- [ ] `sudo systemctl status cloudflared` が active (running)
- [ ] `curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list -H "x-service-token: rectbot-service-token-2024"` が `[]` を返す

GitHub Secrets:
- [ ] `VPS_EXPRESS_URL` が設定されている
- [ ] `SERVICE_TOKEN` が設定されている
- [ ] `DISCORD_REDIRECT_URI` が設定されている
- [ ] すべてのGitHub Actionsが成功している

Worker:
- [ ] `https://dash.rectbot.tech` でエラーが出ない
- [ ] Cloudflare Worker Logsでエラーが出ていない

すべてチェックできれば完璧です！🎉

## 🆘 それでも問題がある場合

以下の情報を共有してください:

1. `https://api.rectbot.tech/api/status` の結果（ブラウザで開く）
2. `https://dash.rectbot.tech` のスクリーンショット
3. GitHub Actions の最新ワークフロー実行結果
4. Cloudflare Worker Logs のスクリーンショット

より詳細な診断ができます！
