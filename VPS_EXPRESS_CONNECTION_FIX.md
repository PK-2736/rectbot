# VPS Express サーバー接続エラー 修正ガイド

## 🚀 クイック修復（推奨）

### 自動診断・修復スクリプトを使用

VPS サーバーにログインして以下を実行：

```bash
# リポジトリをクローンまたは更新
cd ~/rectbot
git pull origin main

# 診断スクリプトを実行
chmod +x vps_diagnose.sh
./vps_diagnose.sh

# 問題が見つかった場合、修復スクリプトを実行
chmod +x vps_fix.sh
./vps_fix.sh
```

**vps_diagnose.sh** でできること：
- ✅ cloudflared サービスの状態確認
- ✅ Express サーバーの起動確認
- ✅ SERVICE_TOKEN の設定確認
- ✅ API エンドポイントのテスト
- ✅ 問題の診断と推奨アクション表示

**vps_fix.sh** でできること：
- ✅ .env ファイルの作成
- ✅ SERVICE_TOKEN の設定
- ✅ Express サーバーの再起動
- ✅ cloudflared サービスの起動
- ✅ 動作確認テスト

---

## 📋 手動での修正手順

自動スクリプトを使わない場合は以下を実行：

## 現在の状況

✅ **成功している項目:**
- Discord OAuth ログイン
- JWT Cookie 認証
- 管理者権限
- ダッシュボード表示

❌ **エラーが発生している項目:**
- VPS Express サーバーへの接続（error code: 1102）
- 募集一覧の取得

## エラーの原因

**Error code: 1102** = Cloudflare Tunnel が VPS サーバーに到達できない

考えられる原因：
1. VPS サーバーが停止している
2. cloudflared サービスが動作していない
3. Express サーバー（Node.js）が起動していない
4. Tunnel の設定が間違っている

## 修正手順

### ステップ 1: VPS サーバーにログイン

```bash
# VPS サーバーに SSH 接続
ssh root@your-vps-ip
```

### ステップ 2: cloudflared サービスの状態確認

```bash
# cloudflared サービスの状態を確認
sudo systemctl status cloudflared

# 期待される出力:
# ● cloudflared.service - Cloudflare Tunnel
#    Active: active (running)
```

**停止している場合:**

```bash
# cloudflared サービスを起動
sudo systemctl start cloudflared

# 自動起動を有効化
sudo systemctl enable cloudflared

# 状態を再確認
sudo systemctl status cloudflared
```

### ステップ 3: Express サーバーの状態確認

```bash
# Node.js プロセスが動いているか確認
ps aux | grep node

# Express サーバーのポートが開いているか確認
netstat -tuln | grep 3000
# または
ss -tuln | grep 3000

# 期待される出力:
# tcp  0  0  127.0.0.1:3000  0.0.0.0:*  LISTEN
```

**起動していない場合:**

```bash
# bot ディレクトリに移動
cd /path/to/rectbot/bot

# 依存関係をインストール（初回のみ）
npm install

# サーバーを起動
npm start
# または
node server.js

# バックグラウンドで起動する場合
nohup node server.js > server.log 2>&1 &
```

### ステップ 4: PM2 で自動起動設定（推奨）

```bash
# PM2 をグローバルインストール
npm install -g pm2

# Express サーバーを PM2 で起動
cd /path/to/rectbot/bot
pm2 start server.js --name rectbot-express

# PM2 の状態確認
pm2 status

# 自動起動設定
pm2 startup
pm2 save

# ログを確認
pm2 logs rectbot-express
```

### ステップ 5: Tunnel 設定の確認

```bash
# Cloudflare Tunnel の設定ファイルを確認
cat ~/.cloudflared/config.yml
```

**期待される内容:**

```yaml
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: <your-tunnel-domain>.cfargotunnel.com
    service: http://localhost:3000
  - service: http_status:404
```

**設定が間違っている場合:**

```bash
# 設定ファイルを編集
nano ~/.cloudflared/config.yml

# 編集後、cloudflared を再起動
sudo systemctl restart cloudflared
```

### ステップ 6: ファイアウォールの確認

```bash
# UFW の状態確認
sudo ufw status

# ポート 3000 がブロックされている場合（ローカルホストのみなので通常は不要）
# cloudflared と Express は同じサーバー内で通信するため、通常はファイアウォール設定は不要
```

## GitHub Secrets の確認

### TUNNEL_URL の確認

https://github.com/PK-2736/rectbot/settings/secrets/actions

以下の Secret が正しく設定されているか確認：

1. **TUNNEL_URL** または **VPS_EXPRESS_URL**
   - 形式: `https://<tunnel-id>.cfargotunnel.com`
   - 例: `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com`

2. **SERVICE_TOKEN**
   - Cloudflare Service Token
   - 形式: `CF-Service-Token-Id: xxx, CF-Service-Token-Secret: yyy`

## トラブルシューティング

### 1. Tunnel ID の確認

```bash
# VPS サーバーで実行
cloudflared tunnel list
```

出力例:
```
ID                                    NAME             CREATED
80cbc750-94a4-4b87-b86d-b328b7e76779  rectbot-tunnel   2024-10-01
```

### 2. Tunnel の接続テスト

```bash
# VPS サーバーで実行
curl -I http://localhost:3000/api/recruitment/list
```

**成功の場合:**
```
HTTP/1.1 200 OK
Content-Type: application/json
```

**失敗の場合:**
```
curl: (7) Failed to connect to localhost port 3000: Connection refused
→ Express サーバーが起動していません
```

### 3. Cloudflare Tunnel 経由でテスト

```bash
# ローカル PC で実行
curl -I https://<your-tunnel-id>.cfargotunnel.com/api/recruitment/list
```

**成功の場合:**
```
HTTP/2 200
```

**失敗の場合:**
```
HTTP/2 502
→ cloudflared が Express サーバーに接続できていません
```

### 4. cloudflared のログを確認

```bash
# VPS サーバーで実行
sudo journalctl -u cloudflared -f
```

エラーメッセージから原因を特定できます。

## クイック診断スクリプト

以下のスクリプトを VPS サーバーで実行して診断：

```bash
#!/bin/bash
echo "=== Rectbot VPS Express 診断 ==="
echo ""

echo "1. cloudflared サービス状態:"
sudo systemctl is-active cloudflared
echo ""

echo "2. Express サーバープロセス:"
ps aux | grep -E "node.*server\.js" | grep -v grep
echo ""

echo "3. ポート 3000 のリスニング状態:"
ss -tuln | grep 3000
echo ""

echo "4. Tunnel 設定ファイル:"
cat ~/.cloudflared/config.yml
echo ""

echo "5. Express API テスト:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/api/recruitment/list
echo ""

echo "診断完了"
```

保存して実行：
```bash
chmod +x diagnose.sh
./diagnose.sh
```

## 暫定対応: モックデータで動作確認

VPS サーバーの修復中は、モックデータで動作確認できます。

現在のコードには既にフォールバック機能が実装されているため、VPS が利用不可能でも：
- ✅ ログインは可能
- ✅ ダッシュボードは表示される
- ✅ テストデータが表示される

## 完全な修正手順まとめ

### VPS サーバーで実行:

```bash
# 1. cloudflared を起動
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# 2. Express サーバーを PM2 で起動
cd /path/to/rectbot/bot
pm2 start server.js --name rectbot-express
pm2 startup
pm2 save

# 3. 動作確認
curl http://localhost:3000/api/recruitment/list
```

### GitHub で確認:

1. Settings > Secrets > Actions
2. `TUNNEL_URL` の値を確認
3. 正しい Tunnel URL が設定されているか確認

### Cloudflare Dashboard で確認:

1. https://dash.cloudflare.com
2. Zero Trust > Networks > Tunnels
3. Tunnel が "Healthy" 状態か確認

## 成功の確認方法

1. https://dash.rectbot.tech にアクセス
2. Discord でログイン
3. **エラーメッセージが消えている**
4. 募集一覧が表示される（実データまたはテストデータ）

## サポート情報

VPS サーバーの接続が修復できない場合は、以下の情報を確認してください：

- VPS プロバイダー
- サーバーの IP アドレス
- Cloudflare Tunnel ID
- Express サーバーのパス

これらの情報があれば、より詳細なサポートが可能です。
