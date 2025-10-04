# GitHub Secrets 設定チェックリスト

## 📋 必要なGitHub Secrets一覧

リポジトリの `Settings → Secrets and variables → Actions` で以下を設定してください。

---

## 🔐 共通（Workers & Pages）

### `CLOUDFLARE_API_TOKEN`
- **説明**: Cloudflare APIトークン
- **取得方法**: Cloudflare Dashboard → My Profile → API Tokens → Create Token
- **権限**: Account Settings:Read, Workers Scripts:Edit, Pages:Edit
- **例**: `abcdef1234567890abcdef1234567890`

### `CLOUDFLARE_ACCOUNT_ID`
- **説明**: CloudflareアカウントID
- **取得方法**: Cloudflare Dashboard → Workers & Pages → Overview → 右サイドバー
- **例**: `74749d85b9c280c0daa93e12ea5d5a14`

---

## 🔧 Cloudflare Workers (Backend)

### `DISCORD_CLIENT_ID`
- **説明**: Discord Application Client ID（公開情報）
- **取得方法**: Discord Developer Portal → Applications → OAuth2 → Client ID
- **用途**: Worker APIとPages両方で使用
- **例**: `1234567890123456789`

### `DISCORD_CLIENT_SECRET` ⚠️ 機密
- **説明**: Discord OAuth Client Secret
- **取得方法**: Discord Developer Portal → Applications → OAuth2 → Client Secret
- **用途**: Worker APIでOAuthトークン交換時に使用
- **例**: `abcdefGHIJKLMNOP1234567890`

### `JWT_SECRET` ⚠️ 機密
- **説明**: JWT署名用シークレット（256-bit）
- **生成済み値**: `T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=`
- **用途**: Worker APIでJWT生成・検証
- **注意**: **上記の値をそのまま使用してください**

### `SUPABASE_URL`
- **説明**: SupabaseプロジェクトURL（公開情報）
- **取得方法**: Supabase Dashboard → Project Settings → API → Project URL
- **例**: `https://abcdefghijklmnop.supabase.co`

### `SUPABASE_SERVICE_ROLE_KEY` ⚠️ 機密
- **説明**: Supabaseサービスロールキー
- **取得方法**: Supabase Dashboard → Project Settings → API → service_role key
- **用途**: Worker APIでSupabaseに管理者権限でアクセス
- **例**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### `SERVICE_TOKEN` ⚠️ 機密
- **説明**: Worker→VPS Express間の認証トークン
- **生成方法**: `openssl rand -base64 32`
- **用途**: Worker APIがVPS Expressにアクセスする際の認証
- **例**: `xyz789ABC456def123GHI890jkl456MNO123pqr789==`

### `VPS_EXPRESS_URL`
- **説明**: VPS ExpressサーバーのURL
- **形式**: `http://IPアドレス:ポート番号`
- **例**: `http://203.0.113.50:3000`

### `ADMIN_DISCORD_ID`
- **説明**: 管理者のDiscord ID（カンマ区切りで複数指定可能）
- **取得方法**: Discord → ユーザー設定 → 詳細設定 → 開発者モード ON → ユーザー右クリック → IDをコピー
- **形式**: カンマ区切り、スペースなし
- **例**: `123456789012345678,987654321098765432`

---

## 🌐 Cloudflare Pages (Frontend)

### `DISCORD_REDIRECT_URI`
- **説明**: Discord OAuth リダイレクトURI
- **値**: `https://api.rectbot.tech/api/discord/callback`
- **注意**: **必ずWorkerのAPIエンドポイントを指定**（Pagesではない）
- **Discord設定**: Developer Portalで同じURIを登録すること

### `NEXT_PUBLIC_API_BASE_URL`
- **説明**: Worker APIのベースURL
- **値**: `https://api.rectbot.tech`
- **用途**: Pagesからの API リクエスト先
- **注意**: 末尾にスラッシュは不要

---

## ✅ 設定確認手順

### 1. Discord Developer Portal設定

```
https://discord.com/developers/applications
```

1. 対象アプリケーションを選択
2. OAuth2 → General
3. Redirects に追加:
   - `https://api.rectbot.tech/api/discord/callback`
4. Client ID と Client Secret をコピー

### 2. Supabase設定

```sql
-- users テーブルを作成
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discord_id TEXT UNIQUE NOT NULL,
  username TEXT,
  role TEXT DEFAULT 'user',
  last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスを作成
CREATE INDEX idx_users_discord_id ON users(discord_id);
```

### 3. VPS Express設定

VPSサーバーで以下を確認:

```bash
# SERVICE_TOKEN を環境変数に設定
export SERVICE_TOKEN="<GitHub Secretsと同じ値>"

# Express サーバーが起動していることを確認
curl http://localhost:3000/health
```

### 4. GitHub Secrets登録

リポジトリで以下を実行:

1. `Settings` → `Secrets and variables` → `Actions`
2. `New repository secret` をクリック
3. 上記の各Secretを登録

### 5. デプロイテスト

```bash
git add .
git commit -m "Configure environment variables"
git push origin main
```

GitHub Actionsのログで以下を確認:
- ✅ Workers: シークレット登録成功
- ✅ Pages: 環境変数チェックで全て `SET` と表示
- ✅ デプロイ成功

---

## 🚨 トラブルシューティング

### 「Environment Variables Check」で変数が空

**原因**: GitHub Secretsが設定されていない

**解決策**:
```bash
# GitHub Secretsを確認
# Settings → Secrets and variables → Actions
# 全ての必須Secretsが登録されているか確認
```

### Discord OAuth「invalid redirect_uri」エラー

**原因**: Discord Developer Portalの設定とコードが一致していない

**解決策**:
1. Discord Developer Portal → OAuth2 → Redirects
2. 正確に `https://api.rectbot.tech/api/discord/callback` を登録
3. 大文字小文字、スラッシュの有無を厳密に確認

### Worker「JWTSecret is required」エラー

**原因**: `JWT_SECRET` が登録されていない

**解決策**:
```bash
# GitHub Secretsに以下を追加
Name: JWT_SECRET
Value: T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=
```

### Pages「環境変数が undefined」

**原因**: ビルド時に環境変数が渡されていない、または `NEXT_PUBLIC_` プレフィックスが不足

**解決策**:
- 環境変数名が `NEXT_PUBLIC_` で始まっているか確認
- GitHub Actionsの `Build Dashboard` ステップで環境変数が設定されているか確認

---

## 📝 設定後の確認

全てのSecretを設定したら:

1. ✅ Discord Developer PortalでリダイレクトURI登録
2. ✅ Supabaseでテーブル作成
3. ✅ VPSでSERVICE_TOKEN設定
4. ✅ GitHub Secretsを全て登録
5. ✅ コミット&プッシュ
6. ✅ GitHub Actionsログ確認
7. ✅ `https://dash.rectbot.tech` でログインテスト
8. ✅ 管理ダッシュボードにアクセス

すべて完了したら、セキュアな認証システムが稼働します🎉
