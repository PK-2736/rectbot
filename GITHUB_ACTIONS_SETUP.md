# GitHub Actions デプロイ設定ガイド

## 📋 必要なGitHub Secrets

あなたのリポジトリには既にGitHub Actions設定があります。
以下のSecretsを設定してください：

### 🔐 GitHub Secrets設定ページ
https://github.com/PK-2736/rectbot/settings/secrets/actions

---

## ✅ 設定が必要なSecrets

### 1. Cloudflare認証（必須）

| Secret名 | 値 | 説明 |
|----------|-----|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | https://dash.cloudflare.com/profile/api-tokens で作成 |
| `CLOUDFLARE_ACCOUNT_ID` | `74749d85b9c280c0daa93e12ea5d5a14` | wrangler.tomlに記載されているAccount ID |

### 2. VPS接続（必須）

| Secret名 | 値 |
|----------|-----|
| `VPS_EXPRESS_URL` | `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com` |
| `SERVICE_TOKEN` | `rectbot-service-token-2024` |

### 3. Discord OAuth（必須）

| Secret名 | 値の取得方法 |
|----------|--------------|
| `DISCORD_CLIENT_ID` | Discord Developer Portal → OAuth2 → General |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 → General |
| `ADMIN_DISCORD_ID` | あなたのDiscord User ID |

### 4. JWT認証（必須）

| Secret名 | 値 |
|----------|-----|
| `JWT_SECRET` | ランダムな32文字以上の文字列 |

**JWT_SECRETを生成（PowerShell）:**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### 5. Supabase（オプション）

| Secret名 | 値の取得方法 |
|----------|--------------|
| `SUPABASE_URL` | Supabase Project Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API |

---

## 🚀 デプロイ方法

### 方法1: コードをPush（自動デプロイ）

```powershell
git add .
git commit -m "Update worker configuration"
git push origin main
```

`backend/` フォルダに変更があると自動的にデプロイされます。

### 方法2: 手動トリガー

1. https://github.com/PK-2736/rectbot/actions
2. **Deploy to Cloudflare Workers** ワークフローを選択
3. **Run workflow** → **Run workflow** ボタンをクリック

---

## 📝 設定手順（詳細）

### ステップ1: Cloudflare API Token作成

1. https://dash.cloudflare.com/profile/api-tokens にアクセス
2. **Create Token** をクリック
3. **Edit Cloudflare Workers** テンプレートを選択
4. **Continue to summary** → **Create Token**
5. Tokenをコピー

### ステップ2: Discord OAuth設定

1. https://discord.com/developers/applications にアクセス
2. あなたのBotアプリケーションを選択
3. **OAuth2** → **General**
   - **CLIENT ID** をコピー
   - **CLIENT SECRET** をコピー（または Reset Secret で生成）
4. **Redirects** に以下を追加:
   - `https://rectbot-backend.workers.dev/api/discord/callback`
   - `https://api.rectbot.tech/api/discord/callback`

### ステップ3: Discord User ID取得

**方法1: Developer Mode（推奨）**
1. Discord設定 → 詳細設定 → 開発者モード ON
2. 自分のユーザー名を右クリック → IDをコピー

### ステップ4: GitHub Secretsを追加

1. https://github.com/PK-2736/rectbot/settings/secrets/actions
2. **New repository secret** をクリック
3. 以下を1つずつ追加:

```
Name: CLOUDFLARE_API_TOKEN
Value: (作成したAPI Token)

Name: CLOUDFLARE_ACCOUNT_ID
Value: 74749d85b9c280c0daa93e12ea5d5a14

Name: VPS_EXPRESS_URL
Value: https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com

Name: SERVICE_TOKEN
Value: rectbot-service-token-2024

Name: DISCORD_CLIENT_ID
Value: (Discord Developer Portalからコピー)

Name: DISCORD_CLIENT_SECRET
Value: (Discord Developer Portalからコピー)

Name: ADMIN_DISCORD_ID
Value: (あなたのDiscord User ID)

Name: JWT_SECRET
Value: (生成したランダム文字列)
```

### ステップ5: テストデプロイ

```powershell
# 小さな変更を加えてpush
cd backend
echo "# Test deploy" >> index.js
git add .
git commit -m "Test GitHub Actions deploy"
git push origin main
```

### ステップ6: デプロイ確認

1. https://github.com/PK-2736/rectbot/actions
2. 最新のワークフロー実行を確認
3. すべてのステップが✅になるまで待つ

### ステップ7: 動作確認

```powershell
# Status確認
curl https://rectbot-backend.workers.dev/api/status

# 期待される結果:
# {
#   "status": "ok",
#   "env": {
#     "VPS_EXPRESS_URL": true,
#     "SERVICE_TOKEN": true,
#     "DISCORD_CLIENT_ID": true,
#     ...
#   }
# }
```

---

## 🐛 トラブルシューティング

### エラー: "CLOUDFLARE_API_TOKEN is required"

**解決方法:**
- GitHub Secretsに `CLOUDFLARE_API_TOKEN` を追加
- Tokenの権限を確認（Workers Scripts: Edit が必要）

### エラー: "Unauthorized" (Deploy step)

**解決方法:**
- API Tokenを再生成
- Account IDが正しいか確認

### エラー: Workflow does not run

**解決方法:**
- `backend/` フォルダ内のファイルを変更してpush
- または手動トリガーを使用

### デプロイは成功するが、環境変数が設定されない

**確認ポイント:**
- GitHub Secretsの名前が正確か確認（大文字小文字も含む）
- ワークフローログで "Registering available secrets" ステップを確認

---

## ✅ チェックリスト

デプロイ前:
- [ ] Cloudflare API Tokenを作成済み
- [ ] すべてのGitHub Secretsを設定済み
- [ ] Discord Developer Portal でRedirect URIを設定済み
- [ ] wrangler.toml の設定を確認済み

デプロイ後:
- [ ] GitHub Actions が成功している
- [ ] `/api/status` が正常に動作
- [ ] すべての環境変数が `true` になっている

---

## 📚 関連ドキュメント

- GitHub Actions Workflow: `.github/workflows/deploy-cloudflare-workers.yml`
- Worker設定: `backend/wrangler.toml`
- Discord OAuth設定: `DISCORD_OAUTH_SETUP.md`
- セキュリティ設定: `frontend/dashboard/SECURITY_SETUP.md`

---

## 🎉 設定完了後

すべての設定が完了すると：

1. ✅ `backend/` への変更が自動的にデプロイされる
2. ✅ 環境変数が自動的に設定される
3. ✅ SSL証明書が自動的に適用される
4. ✅ ダッシュボードが正常に動作する

完全自動化されたCI/CDパイプラインが構築されます！🚀
