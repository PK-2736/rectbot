# VPS Express サーバー エラー 1102 修正ガイド

## ❌ エラー内容
```
Failed to fetch: 503 - VPS Express サーバーに接続できません
error code: 1102
```

## 🔍 原因

Cloudflare WorkerからVPS Expressサーバーへの接続が失敗しています。
考えられる原因：

1. PM2プロセスが停止している
2. Cloudflare Tunnelが停止している
3. ExpressサーバーがService Tokenを検証できていない
4. ポート3000がリッスンしていない

---

## 🔧 解決方法

### VPSにSSH接続

```bash
ssh ubuntu@pk1
cd ~/rectbot
```

### ステップ1: PM2プロセスの確認

```bash
pm2 list
```

#### 期待される結果:
```
┌─────┬──────────────────┬─────────┬─────────┐
│ id  │ name             │ status  │ cpu     │
├─────┼──────────────────┼─────────┼─────────┤
│ 0   │ rectbot          │ online  │ 0%      │
│ 1   │ rectbot-server   │ online  │ 0%      │
└─────┴──────────────────┴─────────┴─────────┘
```

#### もし `stopped` または `errored` の場合:

```bash
# すべて再起動
pm2 restart all

# ログを確認
pm2 logs rectbot-server --lines 50
```

### ステップ2: Expressサーバーのポート確認

```bash
netstat -tlnp | grep :3000
```

#### 期待される結果:
```
tcp6  0  0 :::3000  :::*  LISTEN  12345/node
```

#### ポートが見つからない場合:

```bash
# PM2設定から再起動
cd ~/rectbot/bot
pm2 delete all
pm2 start pm2-server.config.js
pm2 save
```

### ステップ3: ローカル接続テスト

```bash
curl -v http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
```

#### 期待される結果:
```
< HTTP/1.1 200 OK
[]
```

#### 401エラーの場合:

SERVICE_TOKENが正しく読み込まれていません。

```bash
# .envファイルを確認
cat ~/rectbot/bot/.env | grep SERVICE_TOKEN

# 期待される値:
# SERVICE_TOKEN=rectbot-service-token-2024

# PM2を再起動
pm2 restart all
```

### ステップ4: Cloudflare Tunnel状態確認

```bash
sudo systemctl status cloudflared
```

#### 期待される結果:
```
● cloudflared.service - cloudflared
   Active: active (running)
```

#### 停止している場合:

```bash
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# 状態確認
sudo systemctl status cloudflared
```

### ステップ5: Tunnel経由接続テスト

```bash
curl -v https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
```

#### 期待される結果:
```
< HTTP/2 200
[]
```

#### 503エラーの場合:

Tunnelの設定を確認：

```bash
# Tunnel設定ファイル確認
cat ~/.cloudflared/config.yml

# 期待される内容:
# tunnel: 80cbc750-94a4-4b87-b86d-b328b7e76779
# credentials-file: /home/ubuntu/.cloudflared/80cbc750-94a4-4b87-b86d-b328b7e76779.json
# ingress:
#   - hostname: "*.cfargotunnel.com"
#     service: http://localhost:3000
#   - service: http_status:404

# Tunnelを再起動
sudo systemctl restart cloudflared
```

### ステップ6: PM2ログ確認

```bash
# Expressサーバーのログ
pm2 logs rectbot-server --lines 50

# Discord botのログ
pm2 logs rectbot --lines 50
```

エラーメッセージがあれば、その内容を確認してください。

---

## 🔄 完全リセット手順

すべてうまくいかない場合の完全リセット：

```bash
# VPSで実行
cd ~/rectbot

# 1. PM2プロセスをすべて停止
pm2 delete all

# 2. .envファイルを確認
cat bot/.env | grep -E "SERVICE_TOKEN|BACKEND_API_URL"

# 期待される値:
# SERVICE_TOKEN=rectbot-service-token-2024
# BACKEND_API_URL=https://api.rectbot.tech

# 3. PM2を再起動
cd bot
pm2 start pm2-server.config.js
pm2 start ecosystem.config.js
pm2 save

# 4. Cloudflare Tunnelを再起動
sudo systemctl restart cloudflared

# 5. 接続テスト
sleep 5
curl http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"

# 6. Tunnel経由テスト
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
```

---

## 📊 Cloudflare Dashboard でのログ確認

### Worker Logs:

1. https://dash.cloudflare.com → Workers & Pages
2. **rectbot-backend** を選択
3. **Logs** タブ
4. リアルタイムログでエラーを確認

### 確認ポイント:

- `VPS_EXPRESS_URL` が設定されているか
- `SERVICE_TOKEN` が設定されているか
- fetch エラーの詳細メッセージ

---

## ✅ 成功時の状態

すべて正常に動作している場合：

```bash
# PM2
pm2 list
# → rectbot: online
# → rectbot-server: online

# ポート
netstat -tlnp | grep :3000
# → tcp6  0  0 :::3000  :::*  LISTEN

# ローカル
curl http://localhost:3000/api/recruitment/list -H "x-service-token: rectbot-service-token-2024"
# → []

# Tunnel
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
# → []

# Cloudflared
sudo systemctl status cloudflared
# → Active: active (running)
```

---

## 🆘 それでも解決しない場合

以下の情報を共有してください：

1. `pm2 list` の出力
2. `pm2 logs rectbot-server --lines 50` の出力
3. `sudo systemctl status cloudflared` の出力
4. `curl http://localhost:3000/api/recruitment/list -H "x-service-token: rectbot-service-token-2024"` の結果
5. Cloudflare Worker Logs のスクリーンショット

より詳細な診断ができます！
