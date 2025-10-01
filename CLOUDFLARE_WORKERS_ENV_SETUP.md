# Cloudflare Workers Backend - 環境変数設定ガイド

## 重要な変更: VPS Express URL の設定

### 背景
Cloudflare Workers (`https://api.rectbot.tech`) がVPS上のExpressサーバーにプロキシする際、**無限ループを防ぐ**ために、VPSサーバーの直接IPアドレスを使用する必要があります。

---

## 必要な環境変数

### Cloudflare Workers で設定する変数

#### 1. 公開変数 (vars)
```bash
# GitHub Actionsで自動設定
wrangler deploy --var REACT_APP_DISCORD_CLIENT_ID:<value>
wrangler deploy --var REACT_APP_DISCORD_REDIRECT_URI:<value>
wrangler deploy --var SUPABASE_URL:<value>
```

#### 2. **VPS_EXPRESS_URL** (重要！)
VPS上のExpressサーバーの**直接URL**を指定します。

```bash
# 例: VPSのパブリックIPが 203.0.113.50 でポート3000の場合
wrangler deploy --var VPS_EXPRESS_URL:http://203.0.113.50:3000

# または、プライベートネットワーク経由の場合
wrangler deploy --var VPS_EXPRESS_URL:http://10.0.0.5:3000
```

**❌ 間違った設定:**
```bash
# これは無限ループを引き起こします
wrangler deploy --var VPS_EXPRESS_URL:https://api.rectbot.tech
```

**✅ 正しい設定:**
```bash
# VPSの実際のIPアドレスとポート
wrangler deploy --var VPS_EXPRESS_URL:http://XXX.XXX.XXX.XXX:3000
```

#### 3. シークレット (secrets)
```bash
# これらは一度だけ設定すればOK
wrangler secret put SERVICE_TOKEN
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

---

## GitHub Actions での設定

`.github/workflows/deploy-backend.yml` に以下を追加:

```yaml
- name: Deploy to Cloudflare Workers
  run: |
    cd backend
    npx wrangler deploy \
      --var REACT_APP_DISCORD_CLIENT_ID:${{ secrets.DISCORD_CLIENT_ID }} \
      --var REACT_APP_DISCORD_REDIRECT_URI:${{ secrets.DISCORD_REDIRECT_URI }} \
      --var SUPABASE_URL:${{ secrets.SUPABASE_URL }} \
      --var VPS_EXPRESS_URL:${{ secrets.VPS_EXPRESS_URL }}
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

そして、GitHub Secretsに `VPS_EXPRESS_URL` を追加:
```
VPS_EXPRESS_URL = http://<VPS_IP>:3000
```

---

## アーキテクチャ図

```
┌──────────────┐
│   Discord    │
│   Bot (PM2)  │
└──────┬───────┘
       │ API Request
       ↓
┌─────────────────────────┐
│  Cloudflare Workers     │
│  api.rectbot.tech       │ ← ユーザー/Bot からのリクエスト
└──────┬──────────────────┘
       │ Proxy to VPS (直接IP)
       │ http://XXX.XXX.XXX.XXX:3000
       ↓
┌─────────────────────────┐
│  VPS Express Server     │
│  bot/server.js (Port    │
│  3000)                  │
│  - Redis                │
│  - Supabase             │
└─────────────────────────┘
```

---

## 確認方法

### 1. Cloudflare Workers の環境変数を確認
```bash
wrangler tail
# リクエストを送信してログを確認
```

ログに以下が表示されるはず:
```
[PATCH] Sending request to: http://XXX.XXX.XXX.XXX:3000/api/recruitment/123
```

### 2. VPS Express サーバーで接続を確認
```bash
# VPSにSSH
ssh ubuntu@<VPS_IP>

# ログを確認
pm2 logs rectbot

# 直接テスト
curl http://localhost:3000/api/test
```

### 3. エンドツーエンドテスト
```bash
# Botから実際のリクエストを送信
# 成功すれば、VPS Expressサーバーのログに以下が表示される:
# [req-debug] 2025-10-01T14:00:00.000Z PATCH /api/recruitment/xxx from xxx.xxx.xxx.xxx
```

---

## トラブルシューティング

### 問題: HTTP 522 エラーが続く

**原因1: VPS_EXPRESS_URL が未設定または間違っている**
```bash
# 設定を確認
wrangler tail

# 再設定
wrangler deploy --var VPS_EXPRESS_URL:http://<CORRECT_VPS_IP>:3000
```

**原因2: VPS Expressサーバーが停止している**
```bash
ssh ubuntu@<VPS_IP>
pm2 status
pm2 start rectbot  # 必要に応じて
```

**原因3: ファイアウォールがポート3000をブロック**
```bash
# UFWの場合
sudo ufw allow 3000/tcp

# または特定のIPのみ許可（Cloudflareからのみ）
sudo ufw allow from <CLOUDFLARE_IP> to any port 3000
```

**原因4: VPSのExpressサーバーがlocalhostのみリッスン**

`bot/server.js` を確認:
```javascript
// ❌ 間違い
app.listen(3000, 'localhost', ...);

// ✅ 正しい
app.listen(3000, '0.0.0.0', ...);
```

---

## セキュリティ考慮事項

### 1. ファイアウォール設定
VPSのポート3000は、Cloudflare WorkersのIPからのみアクセス可能にすることを推奨:

```bash
# Cloudflare IP範囲からのみ許可
# https://www.cloudflare.com/ips/
sudo ufw allow from 173.245.48.0/20 to any port 3000
sudo ufw allow from 103.21.244.0/22 to any port 3000
# ... 他のCloudflare IP範囲も追加
```

### 2. SERVICE_TOKEN による認証
すべてのリクエストに `Authorization: Bearer <SERVICE_TOKEN>` ヘッダーが必要です。

---

## 参考コマンド

```bash
# Cloudflare Workers のデプロイ
cd backend
wrangler deploy --var VPS_EXPRESS_URL:http://<VPS_IP>:3000

# シークレットの設定
wrangler secret put SERVICE_TOKEN

# ログの確認
wrangler tail

# VPS側の確認
ssh ubuntu@<VPS_IP>
pm2 logs rectbot
pm2 restart rectbot
```

---

**最終更新日:** 2025-10-01
