# Cloudflare Tunnel セットアップガイド

## 🎯 目的

VPS Express サーバーを**外部に公開せず**、Cloudflare Tunnel経由で安全にアクセスできるようにします。

---

## 🏗️ アーキテクチャ

```
┌─────────────────────┐
│  Discord Bot        │
└──────────┬──────────┘
           │ HTTPS + SERVICE_TOKEN
           ↓
┌─────────────────────────────┐
│ Cloudflare Workers          │
│ api.rectbot.tech            │
└──────────┬──────────────────┘
           │ HTTPS (内部トンネル)
           │ https://express.rectbot.tech
           ↓
┌─────────────────────────────┐
│ Cloudflare Tunnel           │
│ (非公開、認証済み接続)       │
└──────────┬──────────────────┘
           │ HTTP (ローカル)
           │ http://127.0.0.1:3000
           ↓
┌─────────────────────────────┐
│ VPS Express Server          │
│ - ポート3000は外部非公開 ✅  │
│ - SERVICE_TOKEN で認証 ✅    │
└─────────────────────────────┘
```

**セキュリティ:**
- ✅ VPSのポート3000は外部からアクセス不可
- ✅ Cloudflare Tunnel経由のみアクセス可能
- ✅ SERVICE_TOKEN で二重認証
- ✅ 完全なHTTPS暗号化
- ✅ DDoS保護

---

## 📋 セットアップ手順

### 1. Cloudflare Tunnel のインストール（VPS側）

```bash
# VPSにSSH接続
ssh ubuntu@<VPS_IP>

# cloudflaredをインストール
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# インストール確認
cloudflared --version
```

---

### 2. Cloudflare にログイン

```bash
cloudflared tunnel login
```

ブラウザが開くので、Cloudflareアカウントでログインし、`rectbot.tech` ドメインを選択。

---

### 3. Tunnel の作成

```bash
# Tunnelを作成
cloudflared tunnel create rectbot-express

# 出力例:
# Tunnel credentials written to /home/ubuntu/.cloudflared/<TUNNEL_ID>.json
# Created tunnel rectbot-express with id <TUNNEL_ID>

# TUNNEL_ID をメモ
```

---

### 4. DNS 設定

```bash
# express.rectbot.tech をTunnelに紐付け
cloudflared tunnel route dns rectbot-express express.rectbot.tech

# 確認
# Cloudflare Dashboard → DNS Records
# CNAMEレコードが自動作成される:
# express.rectbot.tech → <TUNNEL_ID>.cfargotunnel.com
```

---

### 5. Tunnel 設定ファイルの作成

```bash
# 設定ファイルのディレクトリを作成
mkdir -p ~/.cloudflared

# 設定ファイルを作成
nano ~/.cloudflared/config.yml
```

**config.yml の内容:**

```yaml
tunnel: <TUNNEL_ID>  # 手順3でメモしたID
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_ID>.json

ingress:
  # express.rectbot.tech へのアクセスをローカルのポート3000に転送
  - hostname: express.rectbot.tech
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true  # ローカル接続なのでTLS検証不要
  
  # その他のリクエストは404
  - service: http_status:404
```

**保存:** `Ctrl+O` → `Enter` → `Ctrl+X`

---

### 6. Tunnel をテスト起動

```bash
cloudflared tunnel run rectbot-express

# 成功すると以下のようなログが表示される:
# INF Starting tunnel tunnelID=<TUNNEL_ID>
# INF Connection registered connIndex=0
# INF +---------------------+--------------------+
# INF |  express.rectbot.tech  |  localhost:3000   |
# INF +---------------------+--------------------+
```

別のターミナルでテスト:

```bash
# Tunnelが動作しているか確認
curl https://express.rectbot.tech/api/health

# Express サーバーが起動していれば {"ok":true} が返る
```

---

### 7. PM2 でTunnelを常駐化

Tunnelが正常に動作したら、`Ctrl+C` で停止し、PM2で管理します。

```bash
# PM2でTunnelを起動
pm2 start cloudflared --name cloudflare-tunnel -- tunnel run rectbot-express

# 自動起動設定
pm2 save

# 状態確認
pm2 status

# 期待される出力:
# ┌─────┬────────────────────┬─────────┬─────────┐
# │ id  │ name               │ status  │ restart │
# ├─────┼────────────────────┼─────────┼─────────┤
# │ 0   │ rectbot            │ online  │ 0       │
# │ 1   │ cloudflare-tunnel  │ online  │ 0       │
# └─────┴────────────────────┴─────────┴─────────┘
```

---

### 8. ファイアウォール設定（ポート3000を閉じる）

Cloudflare Tunnel経由のみアクセスを許可するため、ポート3000を外部から閉じます。

```bash
# UFWを使用している場合
sudo ufw status

# ポート3000が開いている場合は閉じる
sudo ufw delete allow 3000/tcp

# または特定のルールを削除
sudo ufw status numbered
sudo ufw delete <番号>

# 確認
sudo ufw status
# ポート3000が表示されないことを確認
```

**外部からのアクセステスト:**

```bash
# 別のマシンから実行（失敗するはず）
curl http://<VPS_PUBLIC_IP>:3000/api/health
# Connection refused または Timeout

# Cloudflare Tunnel経由（成功するはず）
curl https://express.rectbot.tech/api/health
# {"ok":true}
```

---

### 9. Cloudflare Workers の環境変数を設定

```bash
cd /workspaces/rectbot/backend

# VPS_EXPRESS_URLを設定
wrangler deploy --var VPS_EXPRESS_URL:https://express.rectbot.tech
```

または、GitHub Actions で自動デプロイする場合:

**GitHub Secrets:**
```
Name: VPS_EXPRESS_URL
Value: https://express.rectbot.tech
```

---

### 10. 動作確認

#### **A. Tunnel の状態確認**

```bash
# VPS側
pm2 logs cloudflare-tunnel --lines 20

# 正常なログ:
# INF Connection registered connIndex=0
```

#### **B. Express サーバーの確認**

```bash
# VPS側
pm2 logs rectbot --lines 20

# 起動ログ:
# [server] Express server listening on port 3000
# [server] PATCH/DELETE endpoints: Direct Supabase access
```

#### **C. エンドツーエンドテスト**

```bash
# ローカルまたは別のマシンから
curl -X GET https://api.rectbot.tech/api/health \
  -H "Authorization: Bearer $SERVICE_TOKEN"

# 成功すれば {"ok":true} が返る
```

#### **D. Discord Botからテスト**

Discord で募集を作成し、「締め切り」ボタンを押す。

**期待されるログ（Bot側）:**
```
[backendFetch] service token present= true url= api.rectbot.tech/api/recruitment/123
管理ページの募集ステータスを更新しました: 123
```

**期待されるログ（VPS Express側）:**
```
[server][recruitment][patch] Updating recruitment: 123
```

---

## 🔧 トラブルシューティング

### **問題: Tunnel が起動しない**

```bash
# 設定ファイルを確認
cat ~/.cloudflared/config.yml

# credentials ファイルが存在するか確認
ls -la ~/.cloudflared/*.json

# 手動で起動してエラーを確認
cloudflared tunnel run rectbot-express
```

---

### **問題: 522 エラーが続く**

```bash
# Express サーバーが起動しているか確認
pm2 status

# ローカルでテスト
curl http://localhost:3000/api/health

# Tunnelのログを確認
pm2 logs cloudflare-tunnel
```

---

### **問題: DNS が解決されない**

```bash
# DNS設定を確認
nslookup express.rectbot.tech

# Cloudflare Dashboard で確認
# DNS Records に以下が存在するか:
# express.rectbot.tech CNAME <TUNNEL_ID>.cfargotunnel.com
```

---

### **問題: SERVICE_TOKEN エラー**

```bash
# VPS側の環境変数を確認
cat /home/ubuntu/rectbot/bot/.env | grep SERVICE_TOKEN

# Cloudflare Workers側を確認
wrangler secret list

# 一致していることを確認
```

---

## 📊 設定の確認

### **完了チェックリスト:**

- [ ] `cloudflared` がインストール済み
- [ ] Tunnel `rectbot-express` が作成済み
- [ ] DNS `express.rectbot.tech` が設定済み
- [ ] `~/.cloudflared/config.yml` が正しく設定
- [ ] PM2 で `cloudflare-tunnel` が起動中
- [ ] PM2 で `rectbot` が起動中
- [ ] ポート3000が外部から閉じている
- [ ] `https://express.rectbot.tech/api/health` が応答する
- [ ] Cloudflare Workers に `VPS_EXPRESS_URL` が設定済み
- [ ] Discord Botからのテストが成功

---

## 🎉 完了！

これで、VPS Express サーバーは**完全に外部非公開**のまま、Cloudflare Tunnel経由で安全にアクセスできるようになりました。

**セキュリティメリット:**
- ✅ DDoS攻撃から保護
- ✅ ポートスキャンから隠蔽
- ✅ SSL/TLS自動管理
- ✅ Cloudflareのグローバルネットワーク活用

---

**最終更新日:** 2025-10-01
