# VPS Express サーバー トラブルシューティング

## 問題: HTTP 522/503 エラー (バックエンドAPIへの接続失敗)

### エラーの症状
```
Error: API error: 503 - {"error":"VPS Express server temporarily unavailable","status":522,"details":"Cloudflare error 522: VPS Express server is not responding"}
```

### 原因
VPS上のExpress APIサーバー (`bot/server.js`) が停止しているか、応答していません。

---

## 解決方法

### 1. VPSサーバーにSSH接続
```bash
ssh ubuntu@<VPS_IP_ADDRESS>
```

### 2. Express APIサーバーの状態確認
```bash
pm2 status
# または
pm2 list
```

**期待される出力:**
```
┌─────┬──────────┬─────────┬─────────┬─────────┬─────────┐
│ id  │ name     │ status  │ restart │ uptime  │ memory  │
├─────┼──────────┼─────────┼─────────┼─────────┼─────────┤
│ 0   │ rectbot  │ online  │ 0       │ 5h      │ 150 MB  │
└─────┴──────────┴─────────┴─────────┴─────────┴─────────┘
```

### 3. サーバーが停止している場合

#### A. PM2で管理されている場合
```bash
# サーバーを起動
pm2 start rectbot

# または、設定ファイルから起動
pm2 start ecosystem.config.js

# ログを確認
pm2 logs rectbot --lines 50
```

#### B. PM2で管理されていない場合
```bash
cd /home/ubuntu/rectbot/bot
# または cd ~/rectbot/bot

# 必要な環境変数を確認
cat .env | grep -E "PORT|BACKEND|SERVICE_TOKEN"

# 手動起動（デバッグ用）
node server.js

# バックグラウンドで起動
nohup node server.js > server.log 2>&1 &
```

### 4. サーバーのヘルスチェック
```bash
# ローカルでテスト（VPS内から）
curl http://localhost:3000/api/test

# 外部からテスト（Cloudflare経由）
curl -H "Authorization: Bearer $SERVICE_TOKEN" \
  https://api.rectbot.tech/api/test
```

### 5. 環境変数の確認
```bash
# .envファイルの確認
cat /home/ubuntu/rectbot/bot/.env

# 必須環境変数:
# - SERVICE_TOKEN
# - BACKEND_API_URL (または BACKEND_URL)
# - DISCORD_BOT_TOKEN
# - REDIS_HOST
# - REDIS_PASSWORD
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
```

### 6. ファイアウォールとポートの確認
```bash
# ポート3000がリッスンしているか確認
sudo netstat -tulpn | grep :3000
# または
sudo ss -tulpn | grep :3000

# UFWステータス確認（使用している場合）
sudo ufw status
```

---

## PM2での永続化設定

### 初回セットアップ
```bash
cd /home/ubuntu/rectbot/bot

# PM2でプロセスを起動
pm2 start server.js --name rectbot

# システム起動時に自動起動を設定
pm2 startup
pm2 save
```

### ecosystem.config.jsの例
```javascript
module.exports = {
  apps: [{
    name: 'rectbot',
    script: './server.js',
    cwd: '/home/ubuntu/rectbot/bot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

---

## デプロイ後のチェックリスト

1. ✅ VPSにSSH接続できる
2. ✅ `/home/ubuntu/rectbot` にコードが存在する
3. ✅ `.env` ファイルが正しく設定されている
4. ✅ `npm install` が完了している
5. ✅ Redis が起動している (`redis-cli ping`)
6. ✅ Express サーバーが起動している (`pm2 status`)
7. ✅ ポート3000がリッスンしている (`netstat -tulpn | grep 3000`)
8. ✅ Cloudflare経由でアクセス可能

---

## 一般的なエラーと対処法

### エラー: "Cannot find module"
```bash
cd /home/ubuntu/rectbot/bot
npm install
pm2 restart rectbot
```

### エラー: "EADDRINUSE" (ポートが既に使用されている)
```bash
# 既存のプロセスを見つける
sudo lsof -i :3000

# プロセスを終了
sudo kill -9 <PID>

# PM2を再起動
pm2 restart rectbot
```

### エラー: Redis connection failed
```bash
# Redisの状態確認
sudo systemctl status redis
# または
redis-cli ping

# Redisを再起動
sudo systemctl restart redis
```

---

## ログの確認

### PM2のログ
```bash
# リアルタイムログ
pm2 logs rectbot

# 過去のログ
pm2 logs rectbot --lines 100

# エラーログのみ
pm2 logs rectbot --err
```

### システムログ
```bash
# syslogの確認
sudo journalctl -u pm2-ubuntu -n 100 -f

# Nginxログ（使用している場合）
sudo tail -f /var/log/nginx/error.log
```

---

## 緊急時のクイックリスタート

```bash
# 全て再起動
pm2 restart all

# 特定のプロセスのみ
pm2 restart rectbot

# 完全にクリーンアップして再起動
pm2 delete all
cd /home/ubuntu/rectbot/bot
pm2 start server.js --name rectbot
pm2 save
```

---

## 連絡先

問題が解決しない場合は、以下の情報を含めて報告してください:

1. `pm2 logs rectbot --lines 50` の出力
2. `pm2 status` の出力
3. エラーが発生した時刻
4. 試した対処法

---

**最終更新日:** 2025-10-01
