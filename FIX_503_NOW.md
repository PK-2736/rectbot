# 🚨 503エラー 緊急対応ガイド

## ❌ 発生したエラー

```
データ取得エラー:
Failed to fetch: 503 - VPS Express サーバーに接続できません。
Cloudflare Tunnel が正しく動作しているか確認してください。
```

## 🔍 原因

503エラーは、以下のいずれかのサービスが停止していることを示しています：

1. ❌ **Cloudflare Tunnel** - Worker → VPS への接続が切れている
2. ❌ **Redis** - VPS上のRedisサーバーが停止
3. ❌ **Express API** - VPS上のExpress APIサーバーが停止

## 🚀 修復手順

### 方法1: 自動修復スクリプト（推奨）⚡

```bash
cd /workspaces/rectbot
./fix-503.sh YOUR_VPS_IP YOUR_USERNAME
```

**例:**
```bash
./fix-503.sh 203.0.113.45 ubuntu
```

このスクリプトが自動的に：
- ✅ Cloudflare Tunnel の状態を確認・再起動
- ✅ Redis の状態を確認・再起動
- ✅ Express API (PM2) の状態を確認・再起動
- ✅ 各サービスの動作を検証

**所要時間: 約2分**

---

### 方法2: 手動修復（スクリプトが使えない場合）

#### Step 1: VPSにSSH接続

```bash
ssh YOUR_USERNAME@YOUR_VPS_IP
```

#### Step 2: サービスの状態を確認

```bash
# Cloudflare Tunnel
sudo systemctl status cloudflared

# Redis
sudo systemctl status redis

# Express API
pm2 status
```

#### Step 3: 停止しているサービスを再起動

```bash
# Cloudflare Tunnel が停止している場合
sudo systemctl start cloudflared
sudo systemctl status cloudflared

# Redis が停止している場合
sudo systemctl start redis
sudo systemctl status redis

# Express API (PM2) が停止している場合
pm2 restart rectbot-server
# または、プロセスが見つからない場合
cd /path/to/your/express-server
pm2 start server.js --name rectbot-server
pm2 save
```

#### Step 4: Tunnel URL の確認

```bash
# Cloudflare Tunnel の設定を確認
sudo cloudflared tunnel list
sudo cloudflared tunnel info <TUNNEL_ID>
```

期待される出力:
```
TUNNEL_ID: 80cbc750-94a4-4b87-b86d-b328b7e76779
URL: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
```

---

## 🔍 詳細診断

### VPSサービスの詳細状態を確認

```bash
cd /workspaces/rectbot
./diagnose-vps.sh YOUR_VPS_IP YOUR_USERNAME
```

このスクリプトが以下を確認します：
- 🔍 Cloudflare Tunnel の動作状態
- 🔍 Redis の接続状態
- 🔍 Express API のエンドポイント応答
- 🔍 Tunnel URL の正確性

---

## ✅ 修復確認

### 1. サービスの状態確認（VPS上で実行）

```bash
# すべてのサービスが "active (running)" になっているか確認
sudo systemctl is-active cloudflared  # → active
sudo systemctl is-active redis        # → active
pm2 status                             # → online
```

### 2. Tunnel接続のテスト

```bash
# Cloudflare Tunnel経由でExpress APIにアクセス
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/health
```

期待される出力:
```json
{"status":"ok","redis":"connected"}
```

### 3. Worker経由でのアクセステスト

ブラウザで以下にアクセス（管理者でログイン後）:

```
https://api.rectbot.tech/api/debug/env
```

期待される出力:
```json
{
  "environment": "production",
  "hasRequiredEnvVars": {
    "VPS_EXPRESS_URL": true,
    "SERVICE_TOKEN": true
  },
  "tunnelUrlPreview": "https://80cbc750-94a4-4b87-b86d-b3..."
}
```

### 4. 管理画面での確認

```
https://dash.rectbot.tech/
```

- ✅ データが正常に表示される
- ✅ 503エラーが出ない
- ✅ 総募集数と募集リストが表示される

---

## 🔄 自動起動の設定（再発防止）

VPS上で以下を実行して、サーバー再起動時に自動的にサービスが起動するように設定：

```bash
# Cloudflare Tunnel の自動起動を有効化
sudo systemctl enable cloudflared

# Redis の自動起動を有効化
sudo systemctl enable redis

# PM2 の自動起動を設定
pm2 startup
# 表示されたコマンドを実行（sudoコマンドが表示される）
pm2 save
```

確認:
```bash
sudo systemctl is-enabled cloudflared  # → enabled
sudo systemctl is-enabled redis        # → enabled
```

---

## 🆘 それでも解決しない場合

### Cloudflare Tunnel のログを確認

```bash
# 最新のログを表示
sudo journalctl -u cloudflared -n 100 --no-pager

# リアルタイムでログを監視
sudo journalctl -u cloudflared -f
```

**よくあるエラー:**

1. **"connection refused"**
   - Express APIが起動していない → `pm2 restart rectbot-server`

2. **"tunnel not found"**
   - Tunnel設定が壊れている → Tunnelを再作成

3. **"authentication failed"**
   - Tunnel認証情報が無効 → `cloudflared tunnel login` で再認証

### Express API のログを確認

```bash
# PM2のログを確認
pm2 logs rectbot-server --lines 100
```

### Redis の動作確認

```bash
# Redisに接続できるか確認
redis-cli ping
# → PONG が返ってくればOK

# Redisの接続数を確認
redis-cli INFO clients
```

---

## 📋 チェックリスト

修復完了の確認:

- [ ] VPSにSSH接続できる
- [ ] `sudo systemctl status cloudflared` → active (running)
- [ ] `sudo systemctl status redis` → active (running)
- [ ] `pm2 status` → rectbot-server が online
- [ ] `curl https://80cbc750...cfargotunnel.com/api/health` → {"status":"ok"}
- [ ] https://api.rectbot.tech/api/debug/env にアクセスできる
- [ ] https://dash.rectbot.tech/ でデータが表示される
- [ ] 自動起動が有効（`systemctl is-enabled`）

---

## 📞 追加サポート

さらに詳しい情報が必要な場合:

- **[QUICK_FIX_503.md](QUICK_FIX_503.md)** - 詳細なトラブルシューティング
- **[ERROR_503_TROUBLESHOOTING.md](ERROR_503_TROUBLESHOOTING.md)** - 完全なエラー解析
- **[CLOUDFLARE_TUNNEL_SETUP.md](CLOUDFLARE_TUNNEL_SETUP.md)** - Tunnel設定手順

---

## ⚡ クイックコマンド集

```bash
# VPS上で実行するコマンド（コピー&ペースト用）

# すべてのサービスを再起動
sudo systemctl restart cloudflared && \
sudo systemctl restart redis && \
pm2 restart rectbot-server

# 状態確認
echo "=== Cloudflare Tunnel ===" && sudo systemctl is-active cloudflared && \
echo "=== Redis ===" && sudo systemctl is-active redis && \
echo "=== Express API ===" && pm2 status

# 自動起動を有効化
sudo systemctl enable cloudflared && \
sudo systemctl enable redis && \
pm2 startup && pm2 save

# ログを確認
sudo journalctl -u cloudflared -n 50 --no-pager && \
pm2 logs rectbot-server --lines 50 --nostream
```

---

**🎯 最優先アクション:**

```bash
./fix-503.sh YOUR_VPS_IP YOUR_USERNAME
```

このコマンド一つで、ほとんどの503エラーが解決します！
