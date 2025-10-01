# デプロイ後の必須手順

## VPS Express サーバーの再起動が必要です

### 変更内容
新しいAPIエンドポイントを追加しました:
- `PATCH /api/recruitment/:messageId` - 募集ステータス更新
- `DELETE /api/recruitment/:messageId` - 募集データ削除

これらのエンドポイントはVPS Express サーバー (`bot/server.js`) で直接Supabaseにアクセスします。

---

## 📋 デプロイ手順

### 1. コードをVPSにプッシュ
```bash
git add .
git commit -m "feat: Add PATCH/DELETE endpoints to VPS Express server"
git push origin main
```

### 2. VPSにSSH接続
```bash
ssh ubuntu@<VPS_IP_ADDRESS>
```

### 3. 最新コードを取得
```bash
cd /home/ubuntu/rectbot
# または cd ~/rectbot

git pull origin main
```

### 4. 依存関係を更新（必要に応じて）
```bash
cd bot
npm install
```

### 5. **PM2でExpressサーバーを再起動**
```bash
pm2 restart rectbot

# またはサーバー名が異なる場合
pm2 restart all

# ログを確認
pm2 logs rectbot --lines 50
```

### 6. サーバーが正常に起動したか確認
```bash
# PM2のステータス確認
pm2 status

# 期待される出力:
# ┌─────┬──────────┬─────────┬─────────┬─────────┐
# │ id  │ name     │ status  │ restart │ uptime  │
# ├─────┼──────────┼─────────┼─────────┼─────────┤
# │ 0   │ rectbot  │ online  │ X       │ Xs      │
# └─────┴──────────┴─────────┴─────────┴─────────┘

# ヘルスチェック
curl http://localhost:3000/api/health
```

### 7. 新しいエンドポイントをテスト
```bash
# PATCHエンドポイントのテスト
curl -X PATCH http://localhost:3000/api/recruitment/TEST_ID \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ended","end_time":"2025-10-01T14:00:00Z"}'

# 成功すれば 200 OK と データが返る
```

---

## 🔧 Cloudflare Workers の設定

### VPS_EXPRESS_URL 環境変数の設定（Cloudflare Tunnel使用）

```bash
cd backend

# Cloudflare Tunnel経由のURLを設定
wrangler deploy --var VPS_EXPRESS_URL:https://express.rectbot.tech
```

**重要:** `express.rectbot.tech` はCloudflare Tunnel経由でVPS Express サーバー（localhost:3000）に接続します。

または、GitHub Actions経由でデプロイする場合:

**GitHub Secrets に追加:**
```
Name: VPS_EXPRESS_URL
Value: https://express.rectbot.tech
```

**`.github/workflows/deploy-backend.yml` を更新:**
```yaml
- name: Deploy to Cloudflare Workers
  run: |
    cd backend
    npx wrangler deploy \
      --var VPS_EXPRESS_URL:${{ secrets.VPS_EXPRESS_URL }}
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## ✅ チェックリスト

完全なデプロイのために、以下を確認してください:

- [ ] コードをVPSにプッシュ (`git push`)
- [ ] VPSで最新コードを取得 (`git pull`)
- [ ] PM2でExpressサーバーを再起動 (`pm2 restart rectbot`)
- [ ] サーバーが正常起動を確認 (`pm2 status`)
- [ ] Cloudflare WorkersにVPS_EXPRESS_URLを設定
- [ ] Cloudflare Workersをデプロイ (`wrangler deploy`)
- [ ] エンドツーエンドテスト（Botで募集締め切りを実行）

---

## 🐛 トラブルシューティング

### PM2再起動後もエラーが出る場合

```bash
# PM2のログを確認
pm2 logs rectbot --err --lines 100

# プロセスを完全に停止して再起動
pm2 delete rectbot
pm2 start server.js --name rectbot
pm2 save
```

### "Cannot find module" エラー

```bash
cd /home/ubuntu/rectbot/bot
npm install
pm2 restart rectbot
```

### Supabase接続エラー

```bash
# 環境変数を確認
cat /home/ubuntu/rectbot/bot/.env | grep SUPABASE

# SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定されているか確認
```

---

## 📊 動作確認

### 正常な動作フロー

```
1. Botがユーザーの「締め切り」ボタン押下を検知
2. Bot → Cloudflare Workers (api.rectbot.tech)
3. Cloudflare Workers → VPS Express (http://XXX:3000)
4. VPS Express → Supabase (直接アクセス)
5. 成功レスポンス → Bot → ユーザーに通知
```

### ログで確認すべき内容

**VPS Express サーバーのログ:**
```bash
pm2 logs rectbot

# 期待されるログ:
[server][recruitment][patch] Updating recruitment: 1234567890
```

**Botのログ:**
```bash
pm2 logs discord-bot

# 期待されるログ:
[backendFetch] service token present= true url= api.rectbot.tech/api/recruitment/1234567890
管理ページの募集ステータスを更新しました: 1234567890
```

---

**最終更新日:** 2025-10-01
