# ⚠️ 認証エラー: 「認証処理中にエラーが発生しました」の解決方法

## 🔍 問題の特定

Discord OAuth認証時に「認証処理中にエラーが発生しました」というエラーが表示される場合、**Cloudflare Worker側の環境変数**が正しく設定されていない可能性があります。

---

## 📋 必須のGitHub Secrets（Worker用）

以下のSecretsが**すべて**設定されている必要があります：

### 1. Discord OAuth関連

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `DISCORD_CLIENT_ID` | Discord Application ID | Discord Developer Portal → Applications → OAuth2 → Client ID |
| `DISCORD_CLIENT_SECRET` | Discord Client Secret | Discord Developer Portal → Applications → OAuth2 → Client Secret (Reset Secret) |
| `DISCORD_REDIRECT_URI` | リダイレクトURI | `https://api.rectbot.tech/api/discord/callback` |

### 2. JWT認証関連

| Secret名 | 説明 | 値 |
|---------|------|-----|
| `JWT_SECRET` | JWT署名用シークレット | `T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=` |

### 3. Supabase関連

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `SUPABASE_URL` | SupabaseプロジェクトURL | Supabase Dashboard → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスロールキー | Supabase Dashboard → Project Settings → API → service_role (secret) |

### 4. その他

| Secret名 | 説明 | 例 |
|---------|------|-----|
| `SERVICE_TOKEN` | Worker→Express認証トークン | ランダムな文字列（`openssl rand -base64 32`で生成） |
| `ADMIN_DISCORD_ID` | 管理者のDiscord ID | `726195003780628621` |
| `VPS_EXPRESS_URL` | VPS ExpressサーバーURL | `http://your-vps-ip:3000` |

---

## ✅ GitHub Secretsの設定手順

### 1. リポジトリのSecretsページにアクセス

```
https://github.com/PK-2736/rectbot/settings/secrets/actions
```

### 2. 各Secretを追加

**`DISCORD_CLIENT_SECRET`の追加例:**

1. `New repository secret` をクリック
2. Name: `DISCORD_CLIENT_SECRET`
3. Value: Discord Developer Portalの `Client Secret` をコピー
4. `Add secret` をクリック

**重要:** `Client Secret`は以下の手順で取得:
1. https://discord.com/developers/applications/1048950201974542477/oauth2
2. `OAuth2` → `Client information`
3. `Client Secret`の下の`Reset Secret`をクリック（初回のみ）
4. 表示されたSecretをコピー（**二度と表示されないので注意！**）

### 3. すべてのSecretを設定

上記の表のすべてのSecretを設定してください。

---

## 🧪 設定確認方法

### 方法1: GitHub Actionsのログで確認

Workers デプロイのログで以下を確認：

```
Registering DISCORD_CLIENT_SECRET
Registering JWT_SECRET
Registering SUPABASE_SERVICE_ROLE_KEY
Registering SERVICE_TOKEN
```

すべて`Registering`と表示されていれば、Secretが設定されています。

### 方法2: Wrangler CLIで確認（ローカル）

```bash
cd backend
npx wrangler secret list
```

出力例:
```
DISCORD_CLIENT_SECRET
JWT_SECRET
SUPABASE_SERVICE_ROLE_KEY
SERVICE_TOKEN
```

### 方法3: Cloudflare Dashboardで確認

1. https://dash.cloudflare.com
2. Workers & Pages → rectbot-backend
3. Settings → Variables and Secrets
4. すべての必須Secretsが表示されているか確認

---

## 🔧 トラブルシューティング

### エラー1: `Failed to get Discord access token`

**原因:** `DISCORD_CLIENT_SECRET`が設定されていない、または間違っている

**解決策:**
1. Discord Developer Portalで`Client Secret`を再取得（Reset Secret）
2. GitHub Secretsに正しい値を設定
3. Workerを再デプロイ

### エラー2: `JWTSecret is required`

**原因:** `JWT_SECRET`が設定されていない

**解決策:**
```bash
# GitHub Secretsに追加
Name: JWT_SECRET
Value: T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=
```

### エラー3: Supabase関連エラー

**原因:** `SUPABASE_URL`または`SUPABASE_SERVICE_ROLE_KEY`が設定されていない

**解決策:**
1. Supabase Dashboard → Project Settings → API
2. `Project URL`と`service_role key`をコピー
3. GitHub Secretsに設定
4. Workerを再デプロイ

---

## 🚀 再デプロイ手順

Secretsを設定したら、必ず再デプロイが必要です：

### 方法1: GitHub Actionsで自動デプロイ

```bash
git commit --allow-empty -m "Trigger redeploy after setting secrets"
git push origin main
```

### 方法2: 手動でSecretsを登録

```bash
cd backend

# 各Secretを手動で登録
echo "your-discord-client-secret" | npx wrangler secret put DISCORD_CLIENT_SECRET
echo "T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=" | npx wrangler secret put JWT_SECRET
echo "your-supabase-service-role-key" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
echo "your-service-token" | npx wrangler secret put SERVICE_TOKEN

# デプロイ
npx wrangler deploy
```

---

## 📝 最終チェックリスト

- [ ] `DISCORD_CLIENT_ID` - GitHub Secretsに設定済み
- [ ] `DISCORD_CLIENT_SECRET` - GitHub Secretsに設定済み（**最重要！**）
- [ ] `DISCORD_REDIRECT_URI` - GitHub Secretsに設定済み
- [ ] `JWT_SECRET` - GitHub Secretsに設定済み
- [ ] `SUPABASE_URL` - GitHub Secretsに設定済み
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - GitHub Secretsに設定済み
- [ ] `SERVICE_TOKEN` - GitHub Secretsに設定済み
- [ ] `ADMIN_DISCORD_ID` - GitHub Secretsに設定済み
- [ ] `VPS_EXPRESS_URL` - GitHub Secretsに設定済み
- [ ] Worker を再デプロイ済み
- [ ] Cloudflare Dashboard でSecrets確認済み

---

## 🎯 次のステップ

1. **すべてのGitHub Secretsを設定**
2. **再デプロイ** (`git push` または `wrangler deploy`)
3. **認証を再テスト**
4. **エラーが出る場合、詳細情報を確認**（デバッグ用エラーメッセージが表示されるようになりました）

すべてのSecretsが設定されていれば、認証が成功するはずです！🎉
