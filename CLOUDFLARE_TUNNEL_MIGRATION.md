# 🎉 Cloudflare Tunnel 対応完了！

## ✅ 実装した変更

### **セキュアなアーキテクチャへの移行**

```
【変更前】
Discord Bot → Cloudflare Workers → http://<VPS_PUBLIC_IP>:3000 ❌
                                    (ポート3000が外部公開)

【変更後】
Discord Bot → Cloudflare Workers → https://express.rectbot.tech ✅
                                    ↓ (Cloudflare Tunnel)
                                    http://127.0.0.1:3000
                                    (ポート3000は外部非公開)
```

---

## 📝 変更されたファイル

### 1. **backend/index.js** (4箇所修正)

すべてのVPS Express URLを Cloudflare Tunnel 経由に変更:

```javascript
// 変更前
const vpsExpressUrl = env.VPS_EXPRESS_URL || 'http://localhost:3000';

// 変更後
const vpsExpressUrl = env.VPS_EXPRESS_URL || 'https://express.rectbot.tech';
```

**対象エンドポイント:**
- POST /api/recruitment
- GET /api/recruitment
- PATCH /api/recruitment/:id
- DELETE /api/recruitment/:id

---

### 2. **backend/wrangler.toml**

環境変数のコメントを更新:

```toml
# VPS_EXPRESS_URL (Cloudflare Tunnel経由、例: https://express.rectbot.tech)
```

---

### 3. **bot/server.js**

起動ログを明確化:

```javascript
console.log(`[server] Express server listening on port ${PORT}`);
console.log(`[server] PATCH/DELETE endpoints: Direct Supabase access`);
console.log(`[server] POST/GET endpoints: Proxying to ${BACKEND_API_URL}`);
```

---

### 4. **DEPLOYMENT_STEPS.md**

Cloudflare Tunnel使用に合わせて手順を更新。

---

### 5. **CLOUDFLARE_TUNNEL_SETUP.md** (新規作成)

Cloudflare Tunnelのセットアップ手順を完全ドキュメント化。

---

## 🔒 セキュリティの改善

### **以前の構成（HTTP + パブリックIP）**
- ❌ ポート3000が外部公開
- ❌ HTTP通信（平文）
- ❌ DDoS攻撃のリスク
- ❌ ポートスキャンで発見される

### **新しい構成（HTTPS + Cloudflare Tunnel）**
- ✅ ポート3000は完全非公開
- ✅ HTTPS暗号化（自動SSL）
- ✅ Cloudflare DDoS保護
- ✅ ポートスキャンから隠蔽
- ✅ SERVICE_TOKEN二重認証
- ✅ 追加コストなし

---

## 🚀 デプロイ手順

### **Step 1: Cloudflare Tunnel のセットアップ（VPS側）**

詳細は `CLOUDFLARE_TUNNEL_SETUP.md` を参照。

```bash
# VPSにSSH
ssh ubuntu@<VPS_IP>

# cloudflaredインストール
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Tunnelを作成
cloudflared tunnel login
cloudflared tunnel create rectbot-express
cloudflared tunnel route dns rectbot-express express.rectbot.tech

# 設定ファイル作成
nano ~/.cloudflared/config.yml
# (内容は CLOUDFLARE_TUNNEL_SETUP.md 参照)

# PM2で起動
pm2 start cloudflared --name cloudflare-tunnel -- tunnel run rectbot-express
pm2 save

# ポート3000を閉じる
sudo ufw delete allow 3000/tcp
```

---

### **Step 2: コードをデプロイ**

```bash
# ローカルまたはCodespaces
cd /workspaces/rectbot

# 変更をコミット
git add .
git commit -m "feat: Cloudflare Tunnel support for secure VPS access"
git push origin main
```

---

### **Step 3: VPS側でコード更新**

```bash
# VPSにSSH
ssh ubuntu@<VPS_IP>

# 最新コードを取得
cd /home/ubuntu/rectbot
git pull origin main

# Express サーバーを再起動
pm2 restart rectbot

# 確認
pm2 status
pm2 logs rectbot --lines 10
```

---

### **Step 4: Cloudflare Workers をデプロイ**

```bash
cd backend

# VPS_EXPRESS_URLを設定してデプロイ
wrangler deploy --var VPS_EXPRESS_URL:https://express.rectbot.tech
```

または、GitHub Actionsで自動デプロイ:

**GitHub Secrets に追加:**
- Name: `VPS_EXPRESS_URL`
- Value: `https://express.rectbot.tech`

---

### **Step 5: 動作確認**

#### **A. Tunnelの確認**
```bash
# VPS側
pm2 logs cloudflare-tunnel --lines 20

# 正常なログ:
# INF Connection registered connIndex=0
```

#### **B. 外部からのアクセステスト**
```bash
# Tunnel経由（成功するはず）
curl https://express.rectbot.tech/api/health

# 直接アクセス（失敗するはず）
curl http://<VPS_PUBLIC_IP>:3000/api/health
# Connection refused
```

#### **C. Discord Botからテスト**
Discord で募集を作成 → 「締め切り」ボタンをクリック

**期待されるログ:**
```
[backendFetch] service token present= true url= api.rectbot.tech/api/recruitment/123
管理ページの募集ステータスを更新しました: 123
```

---

## 📊 チェックリスト

デプロイ完了の確認:

- [ ] Cloudflare Tunnelがインストール済み
- [ ] Tunnel `rectbot-express` が作成済み
- [ ] DNS `express.rectbot.tech` が設定済み
- [ ] PM2で `cloudflare-tunnel` が起動中
- [ ] PM2で `rectbot` が起動中
- [ ] ポート3000が外部から閉じている（UFW確認）
- [ ] `https://express.rectbot.tech/api/health` が応答
- [ ] Cloudflare Workers に `VPS_EXPRESS_URL` 設定済み
- [ ] Discord Botからのテストが成功

---

## 🎯 期待される結果

### **Discord Botログ:**
```
[backendFetch] service token present= true url= api.rectbot.tech/api/recruitment/123
[backendFetch] Retry 1/3 after 1000ms due to status 503  ← これが出なくなる！
管理ページの募集ステータスを更新しました: 123  ← 成功！
```

### **VPS Express ログ:**
```
[server] Express server listening on port 3000
[server] PATCH/DELETE endpoints: Direct Supabase access
[server][recruitment][patch] Updating recruitment: 123
```

### **Cloudflare Tunnel ログ:**
```
INF Connection registered connIndex=0
INF Request: express.rectbot.tech -> localhost:3000
```

---

## 🔐 セキュリティベストプラクティス

### **実装済み:**
- ✅ Cloudflare Tunnel（外部非公開）
- ✅ HTTPS暗号化
- ✅ SERVICE_TOKEN認証

### **推奨される追加対策:**
- [ ] VPSのSSHをキーベース認証のみに
- [ ] UFWで必要最小限のポートのみ開放
- [ ] fail2ban でブルートフォース対策
- [ ] Cloudflare Access で追加のアクセス制御

---

## 📚 関連ドキュメント

- `CLOUDFLARE_TUNNEL_SETUP.md` - Tunnelセットアップの詳細手順
- `DEPLOYMENT_STEPS.md` - デプロイ全体の手順
- `VPS_SERVER_TROUBLESHOOTING.md` - トラブルシューティング

---

**最終更新日:** 2025-10-01

**変更者:** GitHub Copilot

**完了！** 🎉
