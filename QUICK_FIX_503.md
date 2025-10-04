# 🚨 503エラー クイック修復ガイド

## エラーメッセージ
```
データ取得エラー:
Failed to fetch: 503 - VPS Express サーバーに接続できません。
Cloudflare Tunnel が正しく動作しているか確認してください。
```

---

## ⚡ クイック修復（5分で解決）

### 方法1: 自動修復スクリプト（推奨）

```bash
cd /workspaces/rectbot
./fix-503.sh YOUR_VPS_IP YOUR_USERNAME

# 例:
# ./fix-503.sh 192.168.1.100 ubuntu
```

このスクリプトが自動的に：
1. ✅ Cloudflare Tunnel を再起動
2. ✅ Redis を再起動
3. ✅ Express API を再起動
4. ✅ 各サービスの状態を確認

---

### 方法2: 手動修復

VPSにSSH接続して実行：

```bash
# VPSに接続
ssh user@your-vps-ip

# すべてのサービスを再起動
sudo systemctl restart cloudflared
sudo systemctl restart redis
pm2 restart all

# 状態確認
sudo systemctl status cloudflared
redis-cli ping
pm2 list
```

**期待される結果:**
```bash
$ sudo systemctl status cloudflared
● cloudflared.service
   Active: active (running)  ✅

$ redis-cli ping
PONG  ✅

$ pm2 list
│ rectbot-server │ online │  ✅
│ rectbot        │ online │  ✅
```

---

## 🔍 503エラーの主な原因

### 1. Cloudflare Tunnel が停止
- VPS再起動後に自動起動しなかった
- Tunnelサービスがクラッシュした
- ネットワーク接続の問題

### 2. Express API が停止
- メモリ不足でクラッシュ
- PM2プロセスが停止
- コードエラー

### 3. Redis が停止
- メモリ不足
- サービスが停止
- 設定エラー

---

## 📋 詳細な診断手順

### Step 1: Cloudflare Tunnel の確認

```bash
# SSH接続
ssh user@vps-ip

# Tunnelの状態確認
sudo systemctl status cloudflared

# Tunnel情報を確認
sudo cloudflared tunnel info

# ログを確認（エラーがある場合）
sudo journalctl -u cloudflared -n 50
```

#### 正常な場合:
```
● cloudflared.service - cloudflare
   Active: active (running)
   
Tunnel: rectbot-tunnel (80cbc750-94a4-4b87-b86d-b328b7e76779)
URL: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com
```

#### 停止している場合:
```bash
# 再起動
sudo systemctl restart cloudflared

# 自動起動を有効化
sudo systemctl enable cloudflared
```

---

### Step 2: Redis の確認

```bash
# Redis接続テスト
redis-cli ping

# キー数を確認
redis-cli KEYS "recruit:*" | wc -l
```

#### 正常な場合:
```
$ redis-cli ping
PONG
```

#### 停止している場合:
```bash
# 再起動
sudo systemctl restart redis

# 自動起動を有効化
sudo systemctl enable redis
```

---

### Step 3: Express API の確認

```bash
# PM2プロセスを確認
pm2 list

# Express APIのログを確認
pm2 logs rectbot-server --lines 50
```

#### 正常な場合:
```
│ rectbot-server │ 0 │ online │
```

#### 停止している場合:
```bash
# 再起動
pm2 restart rectbot-server

# または最初から起動
cd ~/rectbot/bot
pm2 start server.js --name rectbot-server

# 自動起動を保存
pm2 save
pm2 startup
```

---

## 🎯 修復後の確認

### 1. VPS側で確認

すべてのサービスが起動していることを確認：

```bash
# すべてのステータスを一括確認
echo "=== Cloudflare Tunnel ==="
sudo systemctl is-active cloudflared

echo "=== Redis ==="
redis-cli ping

echo "=== Express API ==="
pm2 list | grep rectbot-server

echo "=== Express API 応答テスト ==="
curl -I http://localhost:3001/api/recruitment/list
```

**すべてOKなら:**
```
=== Cloudflare Tunnel ===
active

=== Redis ===
PONG

=== Express API ===
│ rectbot-server │ online │

=== Express API 応答テスト ===
HTTP/1.1 200 OK  または  HTTP/1.1 401 Unauthorized
```

---

### 2. Worker側で確認

```bash
# Workerのログを確認（別ターミナルで実行）
cd /workspaces/rectbot/backend
wrangler tail
```

---

### 3. ブラウザで確認

1. **管理画面を開く**: https://dash.rectbot.tech/
2. **F12 → Console** を開く
3. エラーが消えて以下のログが表示されることを確認:

```
Fetching recruitments from: https://api.rectbot.tech/api/recruitment/list
Express API responded with status: 200
Fetched 5 recruitments from Express API
```

4. **5秒待つ**（自動更新）
5. 総募集数が表示されることを確認

---

## 💡 予防策：自動起動の設定

VPS再起動時に自動的にサービスが起動するように設定：

```bash
# SSH接続
ssh user@vps-ip

# 自動起動を有効化
sudo systemctl enable cloudflared
sudo systemctl enable redis

# PM2の自動起動を設定
pm2 startup
# 表示されたコマンドをコピーして実行

pm2 save
```

---

## 🔧 よくある問題と解決策

### 問題1: Tunnel URLが古い

#### 症状:
Worker側で503エラーが出るが、VPS側のすべてのサービスは起動している

#### 原因:
Cloudflare Tunnelを再作成した際にURLが変わった

#### 解決策:
```bash
# 1. VPSで新しいTunnel URLを確認
ssh user@vps-ip
sudo cloudflared tunnel info

# 2. Cloudflare Dashboardで更新
# https://dash.cloudflare.com/
# Workers & Pages → rectbot-backend → Settings → Variables
# TUNNEL_URL または VPS_EXPRESS_URL を更新

# 3. Worker を再デプロイ
cd /workspaces/rectbot/backend
wrangler deploy
```

---

### 問題2: メモリ不足でサービスがクラッシュ

#### 症状:
サービスを起動してもすぐに停止する

#### 確認:
```bash
# メモリ使用状況を確認
free -h

# ログでメモリエラーを確認
sudo journalctl -u cloudflared -n 50 | grep -i memory
pm2 logs rectbot-server --lines 50 | grep -i memory
```

#### 解決策:
```bash
# PM2のメモリ制限を設定
pm2 stop rectbot-server
pm2 start server.js --name rectbot-server --max-memory-restart 500M
pm2 save

# Swapを有効化（根本的な解決）
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

### 問題3: ポートが使用中

#### 症状:
```
Error: listen EADDRINUSE: address already in use :::3001
```

#### 解決策:
```bash
# ポート3001を使用しているプロセスを確認
sudo lsof -i :3001

# プロセスを終了
pm2 delete rectbot-server

# 再起動
cd ~/rectbot/bot
pm2 start server.js --name rectbot-server
```

---

## 📊 トラブルシューティング フローチャート

```
503エラー発生
    ↓
VPSにSSH接続できる？
    ↓ YES
Cloudflare Tunnel起動中？
    ↓ NO → sudo systemctl restart cloudflared
    ↓ YES
Redis起動中？
    ↓ NO → sudo systemctl restart redis
    ↓ YES
Express API起動中？
    ↓ NO → pm2 restart rectbot-server
    ↓ YES
Tunnel URLは正しい？
    ↓ NO → Cloudflare Dashboardで更新 + wrangler deploy
    ↓ YES
Worker ログを確認
    ↓
問題を特定して修復
```

---

## 🔗 関連ドキュメント

- `ERROR_503_TROUBLESHOOTING.md` - 詳細なトラブルシューティング
- `fix-503.sh` - 自動修復スクリプト
- `diagnose-vps.sh` - VPS診断スクリプト
- `CLOUDFLARE_TUNNEL_SETUP.md` - Tunnel の詳細設定

---

## ⏱️ 修復にかかる時間

- **自動修復スクリプト**: 1-2分
- **手動修復**: 3-5分
- **Tunnel URL更新が必要な場合**: 10分

---

## 🆘 それでも解決しない場合

1. **すべてのログを確認:**
   ```bash
   # VPSで実行
   sudo journalctl -u cloudflared -n 100
   sudo journalctl -u redis -n 100
   pm2 logs rectbot-server --lines 100
   ```

2. **VPSを再起動:**
   ```bash
   sudo reboot
   ```
   
   再起動後、サービスが自動起動するか確認

3. **Workerのログを詳しく確認:**
   ```bash
   cd /workspaces/rectbot/backend
   wrangler tail --format pretty
   ```

4. **環境変数を再確認:**
   ```javascript
   // ブラウザコンソールで実行
   fetch('https://api.rectbot.tech/api/debug/env', {
     credentials: 'include'
   }).then(r => r.json()).then(console.log);
   ```
