# ⚠️ 不足しているGitHub Secrets

## 🚨 緊急: 以下のSecretが未設定です

### `NEXT_PUBLIC_API_BASE_URL` ⚠️ **必須**

現在のデプロイログで欠けていることが確認されました:

```
⚠️ WARNING: NEXT_PUBLIC_API_BASE_URL secret is not set in GitHub!
```

**設定方法:**

1. GitHubリポジトリにアクセス
   ```
   https://github.com/PK-2736/rectbot/settings/secrets/actions
   ```

2. `New repository secret` をクリック

3. 以下を入力:
   - **Name**: `NEXT_PUBLIC_API_BASE_URL`
   - **Value**: `https://api.rectbot.tech`

4. `Add secret` をクリック

---

## 📋 全GitHub Secrets一覧（確認用）

### ✅ 設定済み（デプロイログで確認済み）

- ✅ `DISCORD_CLIENT_ID`
- ✅ `DISCORD_REDIRECT_URI`
- ✅ `ADMIN_DISCORD_ID`

### ❌ 未設定または確認が必要

#### **Pages用（フロントエンド）**

| Secret名 | 値 | 説明 |
|---------|-----|------|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.rectbot.tech` | **未設定** - Worker APIのベースURL |

#### **Workers用（バックエンド）**

| Secret名 | 値の例 | 状態 |
|---------|--------|------|
| `DISCORD_CLIENT_SECRET` | `abcdefGHIJKLMNOP1234567890` | 要確認 |
| `JWT_SECRET` | `T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=` | 要確認 |
| `SUPABASE_URL` | `https://xxx.supabase.co` | 要確認 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiI...` | 要確認 |
| `SERVICE_TOKEN` | `xyz789ABC456...` | 要確認 |
| `VPS_EXPRESS_URL` | `http://203.0.113.50:3000` | 要確認 |

#### **共通（インフラ）**

| Secret名 | 説明 | 状態 |
|---------|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare APIトークン | 要確認 |
| `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID | 要確認 |

---

## 🔧 即座に実行すべきアクション

### 1. `NEXT_PUBLIC_API_BASE_URL` を追加

```bash
# GitHubのSettings → Secrets and variables → Actions
# New repository secret

Name: NEXT_PUBLIC_API_BASE_URL
Value: https://api.rectbot.tech
```

### 2. 再デプロイ

Secretを追加後、再度プッシュして確認:

```bash
git commit --allow-empty -m "Trigger redeploy after adding NEXT_PUBLIC_API_BASE_URL"
git push origin main
```

### 3. デプロイログで確認

次回のデプロイで以下が表示されるべき:

```
=== Environment Variables Check ===
NEXT_PUBLIC_DISCORD_CLIENT_ID: SET
NEXT_PUBLIC_DISCORD_REDIRECT_URI: SET
NEXT_PUBLIC_API_BASE_URL: SET    ← ここが SET になる
NEXT_PUBLIC_ADMIN_IDS: SET
===================================
```

---

## 📖 詳細なセットアップ手順

詳細は以下のドキュメントを参照:

- `GITHUB_SECRETS_CHECKLIST.md` - 全Secretsの詳細リスト
- `SECURITY_SETUP.md` - セキュリティ設定ガイド
- `CLOUDFLARE_WORKERS_ENV_SETUP.md` - 環境変数の設定方法

---

## 🎯 現在の状態

```
フロントエンド（Pages）
├── ✅ DISCORD_CLIENT_ID
├── ✅ DISCORD_REDIRECT_URI
├── ❌ NEXT_PUBLIC_API_BASE_URL  ← 追加が必要！
└── ✅ ADMIN_DISCORD_ID

バックエンド（Workers）
├── ❓ DISCORD_CLIENT_SECRET
├── ❓ JWT_SECRET
├── ❓ SUPABASE_URL
├── ❓ SUPABASE_SERVICE_ROLE_KEY
├── ❓ SERVICE_TOKEN
└── ❓ VPS_EXPRESS_URL
```

まずは **`NEXT_PUBLIC_API_BASE_URL`** を追加して、Pagesのデプロイを完了させましょう！
