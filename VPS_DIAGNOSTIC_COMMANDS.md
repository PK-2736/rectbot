# 🔍 VPS上で実行: Cloudflare Tunnel詳細診断

以下のコマンドをVPS上で実行して、結果を教えてください。

## 1. Cloudflare Tunnelの設定確認

```bash
# Tunnel IDの確認
sudo cloudflared tunnel list

# Tunnel詳細情報
sudo cloudflared tunnel info 80cbc750-94a4-4b87-b86d-b328b7e76779
```

## 2. Tunnel設定ファイルの確認

```bash
# config.ymlの内容を確認
cat ~/.cloudflared/config.yml
# または
sudo cat /etc/cloudflared/config.yml
```

**期待される内容:**
```yaml
tunnel: 80cbc750-94a4-4b87-b86d-b328b7e76779
credentials-file: /home/ubuntu/.cloudflared/80cbc750-94a4-4b87-b86d-b328b7e76779.json

ingress:
  - hostname: express.rectbot.tech
    service: http://localhost:3000
  - service: http_status:404
```

## 3. Tunnelのログを確認

```bash
# 最新50行のログ
sudo journalctl -u cloudflared -n 50 --no-pager

# エラーがないか確認
sudo journalctl -u cloudflared | grep -i "error\|fail\|refused"
```

## 4. Express APIが正しいポートで動作しているか確認

```bash
# ポート3000でリスニングしているか確認
netstat -tlnp | grep 3000
# または
ss -tlnp | grep 3000

# ローカルホストでAPIにアクセスできるか確認
curl http://localhost:3000/api/health
```

**期待される出力:**
```json
{"status":"ok","redis":"connected"}
```

## 5. Tunnel経由でのアクセステスト

```bash
# Tunnel URL経由でAPIにアクセス
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/health

# または、カスタムドメイン経由
curl https://express.rectbot.tech/api/health
```

## 6. Redis接続の確認

```bash
# Redisに接続できるか確認
redis-cli ping

# Redisの接続数を確認
redis-cli INFO clients | grep connected_clients
```

## 7. PM2プロセスの詳細確認

```bash
# rectbot-server の詳細情報
pm2 show rectbot-server

# 最新のログを確認
pm2 logs rectbot-server --lines 50 --nostream
```

---

上記のコマンドを実行して、結果（特にエラーメッセージ）を教えてください。
問題の原因を特定します。
