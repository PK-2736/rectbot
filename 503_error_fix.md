# 503エラー 緊急修復コマンド

## 即座に実行（サーバー上で）

```bash
# 1. Redisを再起動
sudo systemctl restart redis-server
redis-cli ping

# 2. PM2プロセスを再起動
cd ~/rectbot/bot
pm2 restart all

# 3. Cloudflare Tunnelを再起動
sudo systemctl restart cloudflared

# 4. 状態確認
pm2 list
sudo systemctl status cloudflared
netstat -tuln | grep 3000

# 5. ローカル接続テスト
curl http://localhost:3000/api/dashboard/recruitment

# 6. 外部接続テスト
curl https://dash.rectbot.tech
```

## トラブルシューティング

### PM2プロセスが起動しない場合
```bash
cd ~/rectbot/bot
pm2 stop all
pm2 delete all
pm2 start pm2-server.config.js
pm2 start ecosystem.config.js
pm2 save
```

### Cloudflare Tunnelの設定確認
```bash
# Tunnel一覧
cloudflared tunnel list

# Tunnel情報
cloudflared tunnel info <tunnel-name>

# 設定ファイル確認
cat ~/.cloudflared/config.yml
```

### Expressサーバーが起動しない場合
```bash
# 手動起動してエラー確認
cd ~/rectbot/bot
node server.js

# ポート確認
sudo lsof -i :3000
# ポートが使用中の場合、プロセスを停止
sudo kill -9 <PID>
```

### Redis接続エラーの場合
```bash
# Redis状態確認
sudo systemctl status redis-server

# Redis再起動
sudo systemctl restart redis-server

# Redis接続テスト
redis-cli ping
redis-cli INFO
```

## ログ確認
```bash
# PM2ログ
pm2 logs --lines 50

# Cloudflaredログ
sudo journalctl -u cloudflared -n 50

# システムログ
tail -n 50 /var/log/syslog
```

## 完全リセット（最終手段）
```bash
# すべてのプロセスを停止
pm2 stop all
pm2 delete all

# サービス再起動
sudo systemctl restart redis-server
sudo systemctl restart cloudflared

# 正しい設定でプロセス起動
cd ~/rectbot/bot
pm2 start pm2-server.config.js
pm2 start ecosystem.config.js
pm2 save

# 確認
pm2 list
pm2 logs --lines 10
```