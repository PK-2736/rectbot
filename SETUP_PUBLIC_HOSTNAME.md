# Cloudflare Tunnel Public Hostname 設定ガイド

## 🔍 問題

Cloudflare WorkerからCloudflare Tunnelの `*.cfargotunnel.com` URLに接続できない。

**エラー:** `error code: 1102` - VPS Express サーバーに接続できません

## 📝 原因

`*.cfargotunnel.com` はデフォルトで**プライベート**です。
Cloudflare Worker（異なるネットワークコンテキスト）からはアクセスできません。

## ✅ 解決方法：Public Hostname設定

### ステップ1: Cloudflare Zero Trust Dashboardにアクセス

```powershell
start https://one.dash.cloudflare.com
```

### ステップ2: Tunnelページに移動

1. 左メニューから **Networks** → **Tunnels** を選択
2. **express-tunnel** (ID: `80cbc750-94a4-4b87-b86d-b328b7e76779`) をクリック

### ステップ3: Public Hostnameを追加

1. **Public Hostname** タブを選択
2. **Add a public hostname** をクリック
3. 以下の設定を入力:

```
Subdomain: api
Domain: rectbot.tech (ドロップダウンから選択)
Path: (空欄)
Service:
  Type: HTTP
  URL: localhost:3000
```

4. **Save hostname** をクリック

### ステップ4: 設定確認

設定が完了すると、以下のようになります：

```
Public Hostname: api.rectbot.tech
↓
Tunnel: express-tunnel (80cbc750-94a4-4b87-b86d-b328b7e76779)
↓
Service: http://localhost:3000
↓
VPS Express Server
```

### ステップ5: DNS確認（自動設定）

Cloudflareが自動的にDNSレコードを作成します。確認：

```powershell
nslookup api.rectbot.tech 1.1.1.1
```

期待される結果:
```
Name:    api.rectbot.tech
Addresses:  104.21.x.x
          172.67.x.x
```

### ステップ6: 動作確認

数分待ってから：

```powershell
# ダッシュボードで確認
start https://dash.rectbot.tech
```

**エラー1102が消えれば成功です！** ✅

---

## 🔄 代替方法：wrangler.toml でルート設定

もしPublic Hostnameの設定がうまくいかない場合、wrangler.tomlでルートを設定：

### backend/wrangler.toml を編集:

```toml
name = "rectbot-backend"
account_id = "74749d85b9c280c0daa93e12ea5d5a14"
main = "index.js"
compatibility_date = "2025-09-11"

# Custom Domain route
routes = [
  { pattern = "api.rectbot.tech/*", zone_name = "rectbot.tech" }
]

workers_dev = true
```

### 再デプロイ:

```powershell
git add .
git commit -m "Add custom domain route"
git push origin main
```

---

## 🐛 トラブルシューティング

### エラー: "Tunnel not found"

**原因:** Tunnel IDが正しくない

**解決方法:**
```bash
# VPSで実行
cloudflared tunnel list
```

正しいTunnel IDを確認して使用してください。

### エラー: "Domain not found in dropdown"

**原因:** rectbot.tech がCloudflareで管理されていない

**解決方法:**
1. https://dash.cloudflare.com → Websites
2. rectbot.tech が表示されているか確認
3. 表示されていなければ、ドメインを追加

### Public Hostnameが保存できない

**原因:** サービス設定が間違っている

**解決方法:**
- Type: **HTTP** （HTTPSではない）
- URL: **localhost:3000** （http://をつけない）

---

## ✅ 成功時の状態

すべて正常に動作している場合：

### Cloudflare Zero Trust Dashboard:
```
Tunnel: express-tunnel
Status: HEALTHY
Connectors: 4/4
Public Hostnames: api.rectbot.tech → http://localhost:3000
```

### ブラウザ:
```
https://dash.rectbot.tech
→ エラー1102が消える
→ "導入サーバー数: 0" と表示される
```

### Worker Logs (Cloudflare Dashboard):
```
Proxying to Express API: https://api.rectbot.tech/api/recruitment/list
Express API responded with status: 200
Fetched 0 recruitments from Express API
```

完璧に動作します！🎉

---

## 📞 サポート情報

それでも解決しない場合、以下を確認してください：

1. VPSでのTunnel設定確認:
   ```bash
   cat ~/.cloudflared/config.yml
   cloudflared tunnel info 80cbc750-94a4-4b87-b86d-b328b7e76779
   ```

2. Zero Trust Dashboard のスクリーンショット

3. Worker Logs のエラーメッセージ

より詳細な診断ができます！
