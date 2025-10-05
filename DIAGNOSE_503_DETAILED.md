# 🔧 503エラー原因特定ガイド

## 現在の状況

✅ VPSサービスはすべて正常:
- Cloudflare Tunnel: `active`
- Redis: `active`
- Express API (PM2): `online`

❌ しかし、まだ503エラーが発生

## 🔍 次に確認すべきこと

### VPS上で以下を実行してください

#### 1. ローカルホストでExpress APIが動作しているか確認

```bash
curl http://localhost:3000/api/health
```

**期待される出力:**
```json
{"status":"ok","redis":"connected"}
```

もしエラーが出る場合、Express APIに問題があります。

---

#### 2. Tunnel URL経由でアクセスできるか確認

```bash
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/health
```

**期待される出力:**
```json
{"status":"ok","redis":"connected"}
```

**もしエラーが出る場合、Tunnel設定に問題があります。**

---

#### 3. Tunnel設定ファイルを確認

```bash
cat ~/.cloudflared/config.yml
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

**重要:** `service` が `http://localhost:3000` になっているか確認！

---

#### 4. Tunnelのログでエラーを確認

```bash
sudo journalctl -u cloudflared -n 100 --no-pager | grep -i "error\|fail\|refused"
```

エラーメッセージがあれば教えてください。

---

#### 5. Express APIのログを確認

```bash
pm2 logs rectbot-server --lines 50 --nostream
```

エラーメッセージがあれば教えてください。

---

#### 6. SERVICE_TOKEN認証の確認

Express APIサーバー側で、SERVICE_TOKEN認証が正しく設定されているか確認：

```bash
# Express APIサーバーのコードで環境変数を確認
# server.jsまたはindex.jsのあるディレクトリで
grep -r "SERVICE_TOKEN" .

# .env ファイルがあるか確認
ls -la .env 2>/dev/null || echo ".env ファイルが見つかりません"
```

---

#### 7. 特定のエンドポイントをテスト

```bash
# recruitment/list エンドポイントをテスト
curl -H "Authorization: Bearer YOUR_SERVICE_TOKEN" \
  http://localhost:3000/api/recruitment/list
```

**SERVICE_TOKEN** は環境変数に設定されている値を使用してください。

---

## 🚨 よくある原因

### 原因1: Tunnel URL が間違っている

**確認:**
```bash
sudo cloudflared tunnel list
```

出力されたTunnel IDが `80cbc750-94a4-4b87-b86d-b328b7e76779` と一致するか確認。

**もし違う場合:**
正しいTunnel IDを使って、Worker側の `VPS_EXPRESS_URL` を更新する必要があります。

---

### 原因2: Ingress設定が間違っている

**確認:**
```bash
cat ~/.cloudflared/config.yml
```

`service: http://localhost:3000` になっているか確認。

**もし違う場合:**
```bash
nano ~/.cloudflared/config.yml
```

で編集して、以下に修正:
```yaml
ingress:
  - service: http://localhost:3000
```

保存後、Tunnelを再起動:
```bash
sudo systemctl restart cloudflared
```

---

### 原因3: Express APIがポート3000でリスニングしていない

**確認:**
```bash
netstat -tlnp | grep 3000
```

または
```bash
ss -tlnp | grep 3000
```

**何も表示されない場合:**
Express APIが起動していないか、別のポートを使用しています。

**修正:**
```bash
pm2 logs rectbot-server --lines 100
```

でログを確認し、どのポートでリスニングしているか確認。

---

### 原因4: SERVICE_TOKEN が一致していない

Worker側のSERVICE_TOKENとExpress API側のSERVICE_TOKENが一致していない可能性があります。

**確認方法:**
1. Cloudflare Dashboard → Workers & Pages → rectbot-backend → Settings → Variables
2. `SERVICE_TOKEN` の値を確認
3. VPS上のExpress APIの `.env` ファイルと比較

---

### 原因5: Cloudflare Tunnelの認証が切れている

**確認:**
```bash
sudo journalctl -u cloudflared -n 50 --no-pager
```

"authentication failed" や "unauthorized" などのメッセージがある場合、再認証が必要です。

**修正:**
```bash
cloudflared tunnel login
sudo systemctl restart cloudflared
```

---

## 📊 診断結果の送信

以下のコマンドを実行して、結果をすべて送信してください：

```bash
echo "=== 1. localhost API test ==="
curl http://localhost:3000/api/health
echo ""
echo ""

echo "=== 2. Tunnel URL API test ==="
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/health
echo ""
echo ""

echo "=== 3. Tunnel config ==="
cat ~/.cloudflared/config.yml
echo ""
echo ""

echo "=== 4. Port 3000 listener ==="
netstat -tlnp | grep 3000
echo ""
echo ""

echo "=== 5. PM2 rectbot-server info ==="
pm2 show rectbot-server | grep -A 20 "Describing"
echo ""
echo ""

echo "=== 6. Cloudflared recent logs ==="
sudo journalctl -u cloudflared -n 20 --no-pager
echo ""
echo ""

echo "=== 7. Tunnel list ==="
sudo cloudflared tunnel list
```

この出力を送ってください。原因を特定します！

---

## 🔄 簡易修復コマンド（試してみる価値あり）

```bash
# すべてのサービスを再起動
sudo systemctl restart cloudflared
sudo systemctl restart redis
pm2 restart all

# 5秒待機
sleep 5

# 動作確認
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/health
```
