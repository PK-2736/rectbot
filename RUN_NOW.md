# 🚀 今すぐ実行: 2つの修正手順

## ✅ 修正完了した内容

1. ✅ `wrangler.toml` の環境変数を修正（placeholder → 実際の値）
2. ✅ 503エラー対応ツールを作成
3. ✅ VPS接続確認スクリプトを作成

---

## 🎯 次に実行すべき2つのコマンド

### 1️⃣ Cloudflare Worker をデプロイ（必須）⚡

**実行コマンド:**
```bash
cd /workspaces/rectbot/backend
npx wrangler deploy
```

**所要時間:** 約30秒

**期待される出力:**
```
✨ Successfully deployed rectbot-backend to https://api.rectbot.tech
```

これで、placeholder環境変数が実際の値に更新されます。

---

### 2️⃣ VPSサービスの修復（503エラー対策）🔧

まず、VPS接続情報を確認:
```bash
cd /workspaces/rectbot
./check-vps-connection.sh
```

このスクリプトが:
- ✅ VPSのIPアドレスを確認する方法を案内
- ✅ SSH接続をテスト
- ✅ （オプション）自動的に修復スクリプトを実行

または、VPSのIPアドレスがわかっている場合は直接実行:
```bash
./fix-503.sh YOUR_VPS_IP YOUR_USERNAME
```

**例:**
```bash
./fix-503.sh 203.0.113.45 ubuntu
```

**このスクリプトが自動実行:**
- ✅ Cloudflare Tunnel の再起動
- ✅ Redis の再起動
- ✅ Express API の再起動
- ✅ 各サービスの動作確認

**所要時間:** 約2分

---

## 📋 実行手順（コピー&ペーストOK）

### Step 1: Workerをデプロイ
```bash
cd /workspaces/rectbot/backend && npx wrangler deploy && cd ..
```

### Step 2A: VPS接続情報を確認（IPアドレスがわからない場合）
```bash
./check-vps-connection.sh
```

### Step 2B: VPSサービスを修復（IPアドレスがわかっている場合）
```bash
./fix-503.sh YOUR_VPS_IP YOUR_USERNAME
```

---

## ✅ 完了確認

### 1. Workerのデプロイ確認

ブラウザで以下にアクセス（管理者でログイン）:
```
https://api.rectbot.tech/api/debug/env
```

**期待される出力:**
```json
{
  "environment": "production",
  "hasRequiredEnvVars": {
    "VPS_EXPRESS_URL": true,
    "DISCORD_CLIENT_ID": true,
    "ADMIN_DISCORD_ID": true
  },
  "tunnelUrlPreview": "https://80cbc750-94a4-4b87-b86d-b3..."
}
```

**重要:** `VPS_EXPRESS_URL` が `true` になっていること！

### 2. VPSサービスの確認

VPS上で実行:
```bash
# すべてのサービスが "active" になっているか確認
sudo systemctl is-active cloudflared
sudo systemctl is-active redis
pm2 status
```

**期待される出力:**
```
active
active
┌─────┬──────────────────┬─────────┬─────────┬──────────┐
│ id  │ name             │ mode    │ status  │ restart  │
├─────┼──────────────────┼─────────┼─────────┼──────────┤
│ 0   │ rectbot-server   │ fork    │ online  │ 0        │
└─────┴──────────────────┴─────────┴─────────┴──────────┘
```

### 3. 管理画面で動作確認

```
https://dash.rectbot.tech/
```

**期待される結果:**
- ✅ データが正常に表示される
- ✅ 「placeholder」エラーが出ない
- ✅ 503エラーが出ない
- ✅ 総募集数と募集リストが表示される

---

## 🆘 トラブルシューティング

### エラー1: "CLOUDFLARE_API_TOKEN not found"

**解決策:**
```bash
cd /workspaces/rectbot/backend
npx wrangler login
```

ブラウザが開き、Cloudflareアカウントでの認証が求められます。

---

### エラー2: "VPSのIPアドレスがわからない"

**解決策:**

1. VPSプロバイダーのコントロールパネルにアクセス
2. サーバー情報でIPアドレスを確認

または、SSH設定ファイルを確認:
```bash
cat ~/.ssh/config | grep -A 5 -i "vps\|rectbot"
```

---

### エラー3: "SSH connection failed"

**確認事項:**
1. IPアドレスが正しいか
2. ユーザー名が正しいか（通常は `ubuntu` または `root`）
3. SSH鍵が設定されているか
4. VPSのファイアウォールでSSH（ポート22）が許可されているか

**手動接続テスト:**
```bash
ssh YOUR_USERNAME@YOUR_VPS_IP
```

---

### エラー4: "まだ503エラーが出る"

**原因:** VPSサービスが完全に起動していない

**解決策:**

VPS上で手動で確認:
```bash
# サービスの状態を確認
sudo systemctl status cloudflared
sudo systemctl status redis
pm2 logs rectbot-server

# Tunnel経由でAPIにアクセスできるか確認
curl https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com/api/health
```

**期待される出力:**
```json
{"status":"ok","redis":"connected"}
```

---

## 📚 詳細ドキュメント

問題が解決しない場合は、以下のドキュメントを参照:

- **[FIX_503_NOW.md](FIX_503_NOW.md)** - 503エラーの詳細な修復手順
- **[PLACEHOLDER_ERROR_FIX.md](PLACEHOLDER_ERROR_FIX.md)** - placeholder環境変数エラーの詳細
- **[QUICK_FIX_503.md](QUICK_FIX_503.md)** - 503エラーのクイックガイド
- **[ERROR_503_TROUBLESHOOTING.md](ERROR_503_TROUBLESHOOTING.md)** - 完全なトラブルシューティング

---

## 🎯 優先順位

1. **最優先:** Workerのデプロイ（placeholder修正）
   ```bash
   cd /workspaces/rectbot/backend && npx wrangler deploy
   ```

2. **次に:** VPSサービスの修復（503エラー対策）
   ```bash
   ./fix-503.sh YOUR_VPS_IP YOUR_USERNAME
   ```

3. **最後:** 動作確認
   - https://api.rectbot.tech/api/debug/env
   - https://dash.rectbot.tech/

---

## ✨ これで完了！

両方のコマンドを実行すれば、管理画面が正常に動作するはずです。

何か問題があれば、上記のトラブルシューティングを確認するか、エラーメッセージを教えてください！
