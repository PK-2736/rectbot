# Supabase → Cloudflare R2 バックアップ設定ガイド

自動バックアップシステムを OCI VPS にセットアップする手順です。

## 📋 前提条件

- ✅ OCI VPS へのアクセス権限
- ✅ Supabase プロジェクト
- ✅ Cloudflare アカウント（R2 有効化済み）

---

## 🔧 Step 1: Cloudflare R2 バケット作成

### 1.1 Cloudflare Dashboard にログイン

https://dash.cloudflare.com/

### 1.2 R2 バケットを作成

1. 左メニュー → **R2** → **Create bucket**
2. バケット名: `rectbot-supabase-backups`
3. ロケーション: **Asia-Pacific (APAC)** 推奨
4. **Create bucket** をクリック

### 1.3 R2 API トークンを作成

1. **Manage R2 API Tokens** をクリック
2. **Create API Token** をクリック
3. 設定:
   - Token name: `rectbot-backup-token`
   - Permissions: **Admin Read & Write**
   - TTL: **Forever** (or custom)
4. **Create API Token** をクリック
5. 表示された情報を保存（再表示不可）:
   ```
   Access Key ID: xxxxxxxxxxxxxxxxxxxx
   Secret Access Key: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
   ```

### 1.4 Account ID を取得

R2 ページの右上に表示されている **Account ID** をコピー

---

## 🔧 Step 2: Supabase データベース接続情報を取得

### 2.1 Supabase Dashboard にログイン

https://app.supabase.com/

### 2.2 接続情報を取得

1. プロジェクトを選択
2. **Settings** → **General** → **Reference ID** をコピー
   - 例: `abcdefghijklmnop`
3. **Settings** → **Database** → **Database Password**
   - **[RESET PASSWORD]** をクリックして新しいパスワードを設定
   - ⚠️ このパスワードは一度しか表示されないので必ず保存してください

---

## 🔧 Step 3: GitHub Secrets に登録

**重要**: 環境変数は GitHub Actions の Secrets 経由で VPS に送信されます。

詳細は [GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md) を参照してください。

### 必要な GitHub Secrets（6つ）

1. `SUPABASE_PROJECT_REF` - Supabase プロジェクト参照ID
2. `SUPABASE_DB_PASSWORD` - Supabase データベースパスワード
3. `R2_ACCOUNT_ID` - Cloudflare R2 アカウントID
4. `R2_ACCESS_KEY_ID` - R2 API アクセスキーID
5. `R2_SECRET_ACCESS_KEY` - R2 API シークレットアクセスキー
6. `R2_BUCKET_NAME` - R2 バケット名（例: `rectbot-supabase-backups`）

### GitHub Secrets 登録方法

1. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** をクリック
3. 上記6つの Secrets を登録

---

## 🔧 Step 4: 自動デプロイ

GitHub Secrets を登録したら、Git にコミット & プッシュするだけで自動デプロイされます。

```bash
# PostgreSQL クライアント
sudo apt update
sudo apt install -y postgresql-client

# AWS CLI (R2 アップロード用)
sudo apt install -y awscli

# インストール確認
pg_dump --version
aws --version
```

---

## 🔧 Step 6: バックアップをテスト実行

### 4.1 手動実行

```bash
cd ~/rectbot
./backup_supabase_to_r2.sh
```

### 4.2 ログ確認

```bash
tail -f ~/rectbot/backup.log
```

成功メッセージ:
```
[2025-10-08 12:00:00] ==========================================
[2025-10-08 12:00:01] Supabase バックアップ開始
[2025-10-08 12:00:01] ==========================================
[2025-10-08 12:00:02] Step 1: PostgreSQL データベースをダンプ中...
[2025-10-08 12:00:15] ✅ pg_dump 成功: /home/ubuntu/rectbot/backups/supabase_backup_20251008_120000.sql
[2025-10-08 12:00:15] Step 2: バックアップを圧縮中...
[2025-10-08 12:00:18] ✅ 圧縮成功: /home/ubuntu/rectbot/backups/supabase_backup_20251008_120000.sql.gz
[2025-10-08 12:00:18] バックアップサイズ: 2.3M
[2025-10-08 12:00:18] Step 3: Cloudflare R2 にアップロード中...
[2025-10-08 12:00:25] ✅ R2 アップロード成功: s3://rectbot-supabase-backups/supabase_backup_20251008_120000.sql.gz
[2025-10-08 12:00:25] Step 4: ローカルバックアップファイルを削除中...
[2025-10-08 12:00:25] ✅ ローカルファイル削除
[2025-10-08 12:00:25] Step 5: 30日以前のバックアップを削除中...
[2025-10-08 12:00:26] ✅ 0個の古いバックアップを削除しました
[2025-10-08 12:00:26] ==========================================
[2025-10-08 12:00:26] ✅ バックアップ完了
[2025-10-08 12:00:26] ==========================================
```

### 4.3 R2 バケットで確認

Cloudflare Dashboard → R2 → `rectbot-supabase-backups` でファイルを確認

---

## 🔧 Step 7: Cron ジョブで自動化

### 5.1 Cron ジョブを設定

```bash
crontab -e
```

毎日午前3時に実行（日本時間 JST）:

```bash
# Supabase → R2 バックアップ（毎日午前3時）
0 3 * * * cd /home/ubuntu/rectbot && /bin/bash backup_supabase_to_r2.sh >> /home/ubuntu/rectbot/backup.log 2>&1
```

保存: `Ctrl+X` → `Y` → `Enter`

### 5.2 Cron ジョブを確認

```bash
crontab -l
```

### 5.3 Cron ログ確認（翌日以降）

```bash
tail -100 ~/rectbot/backup.log
```

---

## 🔧 Step 8: バックアップからの復元（緊急時）

### 6.1 R2 からバックアップをダウンロード

```bash
cd ~/rectbot/backups

# 最新バックアップを確認
aws s3 ls s3://rectbot-supabase-backups/ \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com

# 特定のバックアップをダウンロード
AWS_ACCESS_KEY_ID="<your_key>" \
AWS_SECRET_ACCESS_KEY="<your_secret>" \
aws s3 cp s3://rectbot-supabase-backups/supabase_backup_20251008_120000.sql.gz . \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

### 6.2 解凍

```bash
gunzip supabase_backup_20251008_120000.sql.gz
```

### 6.3 Supabase に復元

```bash
export PGPASSWORD="<your_db_password>"

psql -h db.xxxxxxxxxxxx.supabase.co \
     -p 5432 \
     -U postgres \
     -d postgres \
     -f supabase_backup_20251008_120000.sql

unset PGPASSWORD
```

---

## 📊 モニタリング

### バックアップ状況確認

```bash
# 最新バックアップログ
tail -50 ~/rectbot/backup.log

# バックアップ成功回数
grep "✅ バックアップ完了" ~/rectbot/backup.log | wc -l

# R2 バケット内のバックアップ数
AWS_ACCESS_KEY_ID="<key>" \
AWS_SECRET_ACCESS_KEY="<secret>" \
aws s3 ls s3://rectbot-supabase-backups/ \
  --endpoint-url https://<account_id>.r2.cloudflarestorage.com | wc -l
```

---

## 🔒 セキュリティのベストプラクティス

1. ✅ `.env.backup` を Git にコミットしない（`.gitignore` に追加済み）
2. ✅ VPS の `.env.backup` を `chmod 600` で保護
3. ✅ R2 API トークンは必要最小限の権限のみ
4. ✅ バックアップファイルは暗号化を検討（機密データの場合）
5. ✅ 定期的にバックアップからの復元をテスト

---

## 🎯 完了チェックリスト

- [ ] Cloudflare R2 バケット作成
- [ ] R2 API トークン作成
- [ ] Supabase データベース接続情報取得
- [ ] VPS に `.env.backup` 設定
- [ ] `pg_dump` と `aws-cli` インストール
- [ ] バックアップスクリプト手動実行テスト
- [ ] R2 バケットでバックアップ確認
- [ ] Cron ジョブ設定
- [ ] 翌日 Cron ログ確認

---

## 🆘 トラブルシューティング

### エラー: `pg_dump: error: connection to server failed`

- Supabase 接続情報を再確認
- VPS から Supabase への接続を確認: `telnet db.xxxx.supabase.co 5432`

### エラー: `aws: command not found`

```bash
sudo apt update
sudo apt install -y awscli
```

### エラー: `403 Forbidden` (R2 アップロード時)

- R2 API トークンの権限を確認（Admin Read & Write 必要）
- R2_ACCOUNT_ID が正しいか確認

### バックアップサイズが大きすぎる

- 圧縮レベルを調整: `gzip -9` (最大圧縮)
- 不要なテーブルを除外: `pg_dump --exclude-table=logs`

---

## 📚 参考資料

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [PostgreSQL pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [AWS CLI S3 Commands](https://docs.aws.amazon.com/cli/latest/reference/s3/)

---

**構築完了後、Discord でテスト通知を送ることもできます！** 🎉
