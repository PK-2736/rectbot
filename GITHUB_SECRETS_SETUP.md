# GitHub Secrets 設定ガイド

バックアップシステムを自動デプロイするために必要な GitHub Secrets の設定手順です。

## 📋 必要な Secrets 一覧

### 既存の Secrets（確認のみ）

以下は既に設定済みのはずです：

| Secret 名 | 説明 | 取得元 |
|-----------|------|--------|
| `OCI_SSH_KEY` | OCI VPS SSH秘密鍵（Base64エンコード済み） | ローカルの `~/.ssh/id_ed25519` |
| `OCI_HOST` | OCI VPS のIPアドレス | OCI Console |
| `OCI_USER` | OCI VPS のユーザー名 | 通常 `ubuntu` |
| `DISCORD_BOT_TOKEN` | Discord Bot トークン | Discord Developer Portal |
| `SERVICE_TOKEN` | Worker/Bot 間の認証トークン | 任意の文字列 |
| `BACKEND_API_URL` | Worker API URL | `https://api.rectbot.tech` |
| `REDIS_HOST` | Redis ホスト | `localhost` |
| `REDIS_PORT` | Redis ポート | `6379` |
| `INTERNAL_SECRET` | 内部認証シークレット | 任意の文字列 |

### 新規追加が必要な Secrets（バックアップ用）

| Secret 名 | 説明 | 取得方法 | 必須 |
|-----------|------|----------|------|
| `SUPABASE_PROJECT_REF` | Supabase プロジェクト参照ID | [手順 1](#1-supabase_project_ref) | ✅ |
| `SUPABASE_DB_PASSWORD` | Supabase データベースパスワード | [手順 2](#2-supabase_db_password) | ✅ |
| `R2_ACCOUNT_ID` | Cloudflare R2 アカウントID | [手順 3](#3-r2_account_id) | ✅ |
| `R2_ACCESS_KEY_ID` | R2 API アクセスキーID | [手順 4](#4-r2_access_key_id--r2_secret_access_key) | ✅ |
| `R2_SECRET_ACCESS_KEY` | R2 API シークレットアクセスキー | [手順 4](#4-r2_access_key_id--r2_secret_access_key) | ✅ |
| `R2_BUCKET_NAME` | R2 バケット名 | [手順 5](#5-r2_bucket_name) | ✅ |

---

## 🔧 取得手順

### 1. SUPABASE_PROJECT_REF

Supabase プロジェクトの参照IDを取得します。

1. https://app.supabase.com/ にログイン
2. プロジェクトを選択
3. 左メニュー → **Settings** → **General**
4. **Reference ID** をコピー
   ```
   例: abcdefghijklmnop
   ```

### 2. SUPABASE_DB_PASSWORD

Supabase データベースのパスワードを取得/リセットします。

1. https://app.supabase.com/ にログイン
2. プロジェクトを選択
3. 左メニュー → **Settings** → **Database**
4. **Database Password** セクション
5. **Generate a new password** をクリック（またはリセット）
6. 生成されたパスワードをコピー
   ```
   ⚠️ このパスワードは一度しか表示されないので必ず保存してください
   ```

### 3. R2_ACCOUNT_ID

Cloudflare R2 のアカウントIDを取得します。

1. https://dash.cloudflare.com/ にログイン
2. 左メニュー → **R2**
3. 右上に表示されている **Account ID** をコピー
   ```
   例: 1234567890abcdef1234567890abcdef
   ```

### 4. R2_ACCESS_KEY_ID & R2_SECRET_ACCESS_KEY

R2 API トークンを作成します。

1. https://dash.cloudflare.com/ にログイン
2. 左メニュー → **R2**
3. **Manage R2 API Tokens** をクリック
4. **Create API Token** をクリック
5. 設定:
   - **Token name**: `rectbot-backup-token`
   - **Permissions**: **Admin Read & Write**
   - **TTL**: **Forever** (または任意の期間)
6. **Create API Token** をクリック
7. 表示された情報を保存:
   ```
   Access Key ID: xxxxxxxxxxxxxxxxxxxx
   Secret Access Key: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
   ```
   ⚠️ **Secret Access Key は一度しか表示されないので必ず保存してください**

### 5. R2_BUCKET_NAME

R2 バケット名を設定します（既に作成している場合はその名前を使用）。

```
推奨: rectbot-supabase-backups
```

バケットが未作成の場合：

1. https://dash.cloudflare.com/ にログイン
2. 左メニュー → **R2**
3. **Create bucket** をクリック
4. **Bucket name**: `rectbot-supabase-backups`
5. **Location**: **Asia-Pacific (APAC)** 推奨
6. **Create bucket** をクリック

---

## 🚀 GitHub Secrets への登録

### 方法 1: GitHub Web UI から登録（推奨）

1. GitHub リポジトリにアクセス: https://github.com/PK-2736/rectbot
2. **Settings** タブをクリック
3. 左メニュー → **Secrets and variables** → **Actions**
4. **New repository secret** をクリック
5. 以下の6つの Secrets を追加:

#### SUPABASE_PROJECT_REF
```
Name: SUPABASE_PROJECT_REF
Secret: abcdefghijklmnop  # 実際の Project Ref
```

#### SUPABASE_DB_PASSWORD
```
Name: SUPABASE_DB_PASSWORD
Secret: your_actual_password_here  # 実際のDBパスワード
```

#### R2_ACCOUNT_ID
```
Name: R2_ACCOUNT_ID
Secret: 1234567890abcdef1234567890abcdef  # 実際のアカウントID
```

#### R2_ACCESS_KEY_ID
```
Name: R2_ACCESS_KEY_ID
Secret: xxxxxxxxxxxxxxxxxxxx  # 実際のアクセスキーID
```

#### R2_SECRET_ACCESS_KEY
```
Name: R2_SECRET_ACCESS_KEY
Secret: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy  # 実際のシークレットアクセスキー
```

#### R2_BUCKET_NAME
```
Name: R2_BUCKET_NAME
Secret: rectbot-supabase-backups
```

### 方法 2: GitHub CLI から登録

GitHub CLI がインストールされている場合：

```bash
# 認証
gh auth login

# Secrets を登録
gh secret set SUPABASE_PROJECT_REF -b "abcdefghijklmnop"
gh secret set SUPABASE_DB_PASSWORD -b "your_actual_password"
gh secret set R2_ACCOUNT_ID -b "1234567890abcdef1234567890abcdef"
gh secret set R2_ACCESS_KEY_ID -b "xxxxxxxxxxxxxxxxxxxx"
gh secret set R2_SECRET_ACCESS_KEY -b "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
gh secret set R2_BUCKET_NAME -b "rectbot-supabase-backups"
```

---

## ✅ 設定確認

### 1. GitHub Secrets が登録されているか確認

GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**

以下が表示されていればOK：
- ✅ SUPABASE_PROJECT_REF
- ✅ SUPABASE_DB_PASSWORD
- ✅ R2_ACCOUNT_ID
- ✅ R2_ACCESS_KEY_ID
- ✅ R2_SECRET_ACCESS_KEY
- ✅ R2_BUCKET_NAME

### 2. GitHub Actions ワークフローが動作するか確認

```bash
# コミット & プッシュ
git add .
git commit -m "feat: Setup backup system with GitHub Secrets"
git push origin main
```

GitHub リポジトリ → **Actions** タブで **Deploy to OCI** ワークフローが成功していることを確認。

### 3. VPS で環境変数が設定されているか確認

VPS にログインして確認：

```bash
ssh ubuntu@<your-vps-ip>
cd ~/rectbot

# .env.backup ファイルが存在するか確認
ls -lah .env.backup

# 権限が 600 (rw-------) か確認
# 内容を確認（機密情報なので注意）
cat .env.backup
```

期待される出力：
```bash
SUPABASE_PROJECT_REF=abcdefghijklmnop
SUPABASE_DB_PASSWORD=your_actual_password
R2_ACCOUNT_ID=1234567890abcdef1234567890abcdef
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
R2_BUCKET_NAME=rectbot-supabase-backups
BACKUP_RETENTION_DAYS=30
```

### 4. バックアップスクリプトをテスト実行

```bash
cd ~/rectbot
./backup_supabase_to_r2.sh
```

成功メッセージが表示されればOK：
```
[2025-10-08 12:00:00] ==========================================
[2025-10-08 12:00:01] Supabase バックアップ開始
[2025-10-08 12:00:01] ==========================================
...
[2025-10-08 12:00:26] ✅ バックアップ完了
```

### 5. R2 バケットで確認

Cloudflare Dashboard → **R2** → `rectbot-supabase-backups` でバックアップファイルが存在することを確認。

---

## 🔒 セキュリティのベストプラクティス

1. ✅ **GitHub Secrets は暗号化されて保存される**
   - GitHub Actions 実行時のみ復号化される
   - リポジトリの他のユーザーには見えない

2. ✅ **VPS の `.env.backup` を保護**
   - `chmod 600` で所有者のみ読み書き可能
   - Git にコミットしない（`.gitignore` に追加済み）

3. ✅ **R2 API トークンは必要最小限の権限**
   - Admin Read & Write のみ
   - 不要になったら削除

4. ✅ **Supabase パスワードは定期的にローテーション**
   - 3〜6ヶ月ごとにリセット推奨
   - リセット後は GitHub Secrets も更新

5. ✅ **バックアップファイルは暗号化を検討**
   - 機密データの場合は `gpg` で暗号化してから R2 にアップロード

---

## 🆘 トラブルシューティング

### GitHub Actions でエラー: `SUPABASE_PROJECT_REF が設定されていません`

→ GitHub Secrets が正しく登録されているか確認

### VPS で `.env.backup` が存在しない

→ GitHub Actions のログを確認。SSH接続エラーやパーミッションエラーがないか確認

### バックアップスクリプトでエラー: `pg_dump: error: connection to server failed`

→ `SUPABASE_PROJECT_REF` と `SUPABASE_DB_PASSWORD` が正しいか確認

### R2 アップロードでエラー: `403 Forbidden`

→ R2 API トークンの権限を確認。Admin Read & Write が必要

---

## 📚 次のステップ

1. ✅ GitHub Secrets を登録
2. ✅ コミット & プッシュして GitHub Actions を実行
3. ✅ VPS でバックアップスクリプトをテスト実行
4. ✅ Cron ジョブを設定（毎日午前3時）

```bash
crontab -e

# 以下を追加
0 3 * * * cd /home/ubuntu/rectbot && /bin/bash backup_supabase_to_r2.sh >> /home/ubuntu/rectbot/backup.log 2>&1
```

5. ✅ 翌日、バックアップログを確認

```bash
tail -f ~/rectbot/backup.log
```

---

**これで完全自動化されたバックアップシステムの完成です！** 🎉
