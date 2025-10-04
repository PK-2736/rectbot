# 🚨 503エラー トラブルシューティングガイド

## エラーの症状

管理画面に以下のエラーが表示される:
```
データ取得エラー:
Failed to fetch: 503
```

## 503エラーの意味

**503 Service Unavailable** は、VPS Express APIに接続できないことを示しています。

---

## 🔍 原因の特定

503エラーは以下のいずれかが原因です:

### 1. ❌ Cloudflare Tunnel が停止している
- VPSとCloudflare Workerの橋渡しをするTunnelが動作していない

### 2. ❌ VPS Express API (server.js) が停止している
- Redisからデータを取得するExpress APIが起動していない

### 3. ❌ Redis が停止している
- 募集データが保存されているRedisが起動していない

### 4. ⚠️ SERVICE_TOKEN が間違っている
- WorkerとExpress APIの認証トークンが一致していない

---

## 🛠️ 診断手順

### 方法1: 自動診断スクリプトを使用（推奨）

```bash
cd /workspaces/rectbot
./diagnose-vps.sh your-vps-ip your-username
```

このスクリプトが自動的に以下を確認します:
- ✅ SSH接続
- ✅ Redis の状態
- ✅ Express API の状態
- ✅ Cloudflare Tunnel の状態
- ✅ Discord Bot の状態

### 方法2: 手動で確認

VPSにSSH接続して手動で確認:

```bash
# VPSに接続
ssh user@your-vps-ip

# 1. Redis の確認
redis-cli ping
# 期待される出力: PONG

# 2. PM2 プロセスの確認
pm2 list
# rectbot-server が online になっているか確認

# 3. Express API の応答確認
curl http://localhost:3001/api/recruitment/list
# JSONデータまたは401エラーが返ればOK

# 4. Cloudflare Tunnel の確認
sudo systemctl status cloudflared
# active (running) になっているか確認

# 5. Tunnel の詳細情報
sudo cloudflared tunnel info
```

---

## 🔧 修復方法

### ケースA: Cloudflare Tunnel が停止している

#### 確認:
```bash
ssh user@your-vps-ip
sudo systemctl status cloudflared
# 出力: inactive (dead) または failed
```

#### 修復:
```bash
# Cloudflare Tunnel を再起動
sudo systemctl restart cloudflared

# 状態確認
sudo systemctl status cloudflared

# 自動起動を有効化（まだの場合）
sudo systemctl enable cloudflared
```

#### 確認:
```bash
# Tunnel が起動しているか確認
sudo cloudflared tunnel list
```

---

### ケースB: Express API が停止している

#### 確認:
```bash
pm2 list
# rectbot-server が stopped または errored
```

#### 修復:
```bash
# Express API を再起動
pm2 restart rectbot-server

# ログを確認
pm2 logs rectbot-server --lines 50
```

#### Express API が存在しない場合:
```bash
cd ~/rectbot/bot
pm2 start server.js --name rectbot-server

# 環境変数を設定
pm2 restart rectbot-server --update-env
```

---

### ケースC: Redis が停止している

#### 確認:
```bash
redis-cli ping
# エラーが返る場合
```

#### 修復:
```bash
# Redisを再起動
sudo systemctl restart redis

# 状態確認
sudo systemctl status redis

# 自動起動を有効化（まだの場合）
sudo systemctl enable redis
```

#### 確認:
```bash
# Redisに接続できるか確認
redis-cli ping
# 出力: PONG

# 募集データが存在するか確認
redis-cli KEYS "recruit:*"
```

---

### ケースD: SERVICE_TOKEN が間違っている

#### 確認:
VPSのExpress APIのログを確認:
```bash
pm2 logs rectbot-server --lines 20
```

「Invalid service token」や「Unauthorized」のログがあれば、トークンが間違っています。

#### 修復:

1. **VPS側の設定を確認:**
```bash
# .envファイルを確認
cat ~/rectbot/bot/.env | grep SERVICE_TOKEN
```

2. **Cloudflare Worker側の設定を確認:**
```bash
# ローカルで確認
cd /workspaces/rectbot/backend
cat wrangler.toml | grep SERVICE_TOKEN
```

3. **両方が一致していることを確認**

4. **一致していない場合:**
   - Cloudflare Dashboard で `SERVICE_TOKEN` を更新
   - Worker を再デプロイ: `wrangler deploy`
   - VPSでExpress APIを再起動: `pm2 restart rectbot-server --update-env`

---

## 🎯 完全な修復フロー

すべてのサービスを一括で再起動する場合:

```bash
# VPSにSSH接続
ssh user@your-vps-ip

# 1. Redisを再起動
sudo systemctl restart redis
redis-cli ping

# 2. PM2プロセスを再起動
pm2 restart all

# 3. Cloudflare Tunnelを再起動
sudo systemctl restart cloudflared

# 4. すべての状態を確認
echo "=== Redis ==="
redis-cli ping

echo "=== PM2 ==="
pm2 list

echo "=== Cloudflared ==="
sudo systemctl status cloudflared
```

---

## 🔍 Worker のログを確認

Cloudflare Worker側でも詳細なログを確認できます:

```bash
cd /workspaces/rectbot/backend
wrangler tail
```

このコマンドでWorkerのリアルタイムログが表示されます。

### ログで確認すべきポイント:

1. **認証成功:**
   ```
   Admin API: /api/recruitment/list accessed
   JWT validation passed for admin: 726195003780628621
   ```

2. **プロキシ開始:**
   ```
   Proxying to Express API: https://...cfargotunnel.com/api/recruitment/list
   ```

3. **Express APIの応答:**
   ```
   Express API responded with status: 200
   Fetched 5 recruitments from Express API
   ```

4. **エラーの場合:**
   ```
   Error proxying to Express API: FetchError: ...
   VPS Express unreachable
   ```

---

## 📊 正常な状態の確認

すべてが正常に動作している場合:

### VPS側:
```bash
$ redis-cli ping
PONG

$ pm2 list
│ rectbot-server │ online │
│ rectbot        │ online │

$ sudo systemctl status cloudflared
● cloudflared.service
   Active: active (running)

$ curl http://localhost:3001/api/recruitment/list
[{"id":"...","guild_name":"..."}]
```

### Worker側:
```bash
$ wrangler tail
Admin API: /api/recruitment/list accessed
JWT validation passed for admin: 726195003780628621
Proxying to Express API: https://...
Express API responded with status: 200
Fetched 5 recruitments from Express API
```

### ブラウザ側:
F12 → Console:
```
Fetching recruitments from: https://api.rectbot.tech/api/recruitment/list
Fetched 5 recruitments from API
Total recruitments: 5
```

---

## 🚀 修復後の確認手順

1. **VPSですべてのサービスを再起動**
   ```bash
   sudo systemctl restart redis cloudflared
   pm2 restart all
   ```

2. **Workerを再デプロイ**
   ```bash
   cd /workspaces/rectbot/backend
   wrangler deploy
   ```

3. **管理画面を開く**
   - https://dash.rectbot.tech/
   - F12 → Console を開く

4. **ログを確認**
   - エラーメッセージが消えていることを確認
   - 「Fetched X recruitments from API」が表示されることを確認

5. **テスト**
   - Discordで新しい募集を立てる
   - 5秒以内に管理画面に反映されることを確認

---

## 💡 予防策

### 自動起動の設定

VPSの再起動時に自動的にサービスが起動するように設定:

```bash
# Redis
sudo systemctl enable redis

# Cloudflare Tunnel
sudo systemctl enable cloudflared

# PM2（起動時に自動実行）
pm2 startup
pm2 save
```

### 監視の設定

PM2で自動再起動を設定:

```bash
# クラッシュ時に自動再起動
pm2 start server.js --name rectbot-server --max-memory-restart 500M --exp-backoff-restart-delay=100
pm2 save
```

---

## 🔗 関連ドキュメント

- `SECURITY_SETUP.md` - 全体のアーキテクチャ
- `CLOUDFLARE_TUNNEL_SETUP.md` - Tunnel の詳細設定
- `VPS_EXPRESS_TROUBLESHOOTING.md` - Express API のトラブルシューティング
- `diagnose-vps.sh` - 自動診断スクリプト

---

## 📞 まだ解決しない場合

上記をすべて試しても503エラーが解決しない場合:

1. **Worker のログをフルで確認:**
   ```bash
   wrangler tail --format pretty
   ```

2. **VPS の全ログを確認:**
   ```bash
   # Cloudflaredのログ
   sudo journalctl -u cloudflared -n 50

   # Express APIのログ
   pm2 logs rectbot-server --lines 100

   # Redisのログ
   sudo journalctl -u redis -n 50
   ```

3. **環境変数を再確認:**
   - Cloudflare Dashboard → Workers → rectbot-backend → Settings → Variables
   - `SERVICE_TOKEN`, `VPS_EXPRESS_URL`, `TUNNEL_URL` が正しく設定されているか

4. **Tunnel URLが正しいか確認:**
   ```bash
   # VPSで確認
   sudo cloudflared tunnel info
   ```
   表示されるURLが、WorkerのVPS_EXPRESS_URLと一致しているか確認
