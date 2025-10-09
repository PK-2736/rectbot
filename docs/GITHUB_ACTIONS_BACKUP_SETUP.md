# GitHub Actions バックアップシステム セットアップガイド

## 概要

このガイドでは、GitHub Actions を使用して Supabase データベースを Cloudflare R2 に自動バックアップするシステムのセットアップ方法を説明します。

## アーキテクチャ

```
GitHub Actions (Ubuntu Runner)
    ↓ (1) pg_dump
Supabase Database (IPv6 OK)
    ↓ (2) gzip 圧縮
ローカルストレージ
    ↓ (3) AWS CLI (S3互換)
Cloudflare R2 バケット
```

## メリット

- ✅ **IPv6 問題を回避**: GitHub Actions ランナーは IPv4/IPv6 両方をサポート
- ✅ **VPS 不要**: GitHub の無料枠内で実行可能（月2,000分）
- ✅ **スケジュール実行**: Cron で毎日自動実行
- ✅ **手動実行可能**: workflow_dispatch で即座にバックアップ可能
- ✅ **ログ管理**: GitHub Actions の UI でログを確認
- ✅ **通知機能**: 失敗時にメール通知が届く
- ✅ **バージョン管理**: ワークフローファイルも Git で管理

## 前提条件

### 1. GitHub Secrets の設定

以下の6つの Secrets を GitHub リポジトリに登録する必要があります：

| Secret 名 | 説明 | 取得方法 |
|-----------|------|----------|
| `SUPABASE_PROJECT_REF` | Supabase プロジェクト参照 ID | Supabase Dashboard → Settings → General → Reference ID |
| `SUPABASE_DB_PASSWORD` | データベースパスワード | Supabase Dashboard → Settings → Database → Password |
| `R2_ACCOUNT_ID` | Cloudflare アカウント ID | Cloudflare Dashboard → R2 → Overview |
| `R2_ACCESS_KEY_ID` | R2 API アクセスキー ID | Cloudflare Dashboard → R2 → Manage R2 API Tokens |
| `R2_SECRET_ACCESS_KEY` | R2 API シークレットアクセスキー | 同上（作成時のみ表示） |
| `R2_BUCKET_NAME` | R2 バケット名 | 例: `rectbot-supabase-backups` |

### 2. Cloudflare R2 バケットの作成

1. Cloudflare Dashboard にログイン
2. **R2** → **Create bucket** をクリック
3. バケット名を入力（例: `rectbot-supabase-backups`）
4. **Create bucket** をクリック

### 3. R2 API トークンの作成

1. Cloudflare Dashboard → **R2** → **Manage R2 API Tokens**
2. **Create API token** をクリック
3. トークン名を入力（例: `GitHub Actions Backup`）
4. **Permissions**:
   - **Object Read & Write** を選択
   - バケットを指定（上記で作成したバケット）
5. **Create API Token** をクリック
6. 表示された **Access Key ID** と **Secret Access Key** をコピー
   - ⚠️ Secret Access Key は一度しか表示されません！

## GitHub Secrets 登録手順

### Web UI で登録

1. GitHub リポジトリページを開く
2. **Settings** → **Secrets and variables** → **Actions** をクリック
3. **New repository secret** をクリック
4. 以下の Secrets を一つずつ登録:

```
Name: SUPABASE_PROJECT_REF
Secret: fkqynvlkwbexbndfxwtf
```

```
Name: SUPABASE_DB_PASSWORD
Secret: [あなたのパスワード]
```

```
Name: R2_ACCOUNT_ID
Secret: 74749d85b9c280c0daa93e12ea5d5a14
```

```
Name: R2_ACCESS_KEY_ID
Secret: [R2 API の Access Key ID]
```

```
Name: R2_SECRET_ACCESS_KEY
Secret: [R2 API の Secret Access Key]
```

```
Name: R2_BUCKET_NAME
Secret: rectbot-supabase-backups
```

### GitHub CLI で登録（オプション）

```bash
# GitHub CLI をインストール済みの場合
gh secret set SUPABASE_PROJECT_REF -b "fkqynvlkwbexbndfxwtf"
gh secret set SUPABASE_DB_PASSWORD -b "your_password"
gh secret set R2_ACCOUNT_ID -b "74749d85b9c280c0daa93e12ea5d5a14"
gh secret set R2_ACCESS_KEY_ID -b "your_access_key_id"
gh secret set R2_SECRET_ACCESS_KEY -b "your_secret_access_key"
gh secret set R2_BUCKET_NAME -b "rectbot-supabase-backups"
```

## ワークフローファイルの配置

`.github/workflows/backup-supabase-to-r2.yml` ファイルが以下のように配置されていることを確認:

```
rectbot/
└── .github/
    └── workflows/
        ├── deploy-oci.yml
        └── backup-supabase-to-r2.yml  ← 新規追加
```

## 実行スケジュール

### 自動実行

- **毎日午前3時（日本時間）** に自動実行
- Cron 式: `0 18 * * *`（UTC 18:00 = JST 3:00）

### 手動実行

1. GitHub リポジトリページを開く
2. **Actions** タブをクリック
3. 左サイドバーから **Backup Supabase to Cloudflare R2** を選択
4. **Run workflow** ボタンをクリック
5. **Run workflow** を確認

## バックアップの確認

### GitHub Actions ログで確認

1. **Actions** タブを開く
2. 最新のワークフロー実行をクリック
3. 各ステップのログを確認:
   - ✅ Dump Supabase database
   - ✅ Compress backup
   - ✅ Upload to Cloudflare R2
   - ✅ Cleanup old backups

### Cloudflare R2 で確認

1. Cloudflare Dashboard → **R2** → バケット名をクリック
2. バックアップファイルが表示されることを確認:
   ```
   supabase_backup_20251009_180000.sql.gz
   supabase_backup_20251010_180000.sql.gz
   ...
   ```

### バックアップファイル名の形式

```
supabase_backup_YYYYMMDD_HHMMSS.sql.gz
```

例: `supabase_backup_20251009_180523.sql.gz`

## 保持ポリシー

- **保持期間**: 30日間
- **自動削除**: 30日より古いバックアップは自動的に削除されます
- **実行タイミング**: 各バックアップ実行時にクリーンアップも実行

## リストア方法

### 方法1: VPS 上でリストア

1. R2 からバックアップをダウンロード:
```bash
cd ~/rectbot
source .env.backup

ENDPOINT_URL="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
BACKUP_FILE="supabase_backup_20251009_180523.sql.gz"

aws s3 cp \
  "s3://${R2_BUCKET_NAME}/${BACKUP_FILE}" \
  "${BACKUP_FILE}" \
  --endpoint-url="${ENDPOINT_URL}"
```

2. 解凍:
```bash
gunzip ${BACKUP_FILE}
```

3. リストア:
```bash
PGPASSWORD="${SUPABASE_DB_PASSWORD}" psql \
  -h "db.${SUPABASE_PROJECT_REF}.supabase.co" \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f "${BACKUP_FILE%.gz}"
```

### 方法2: 既存のリストアスクリプトを使用

```bash
cd ~/rectbot
./restore_from_r2.sh
```

このスクリプトは対話的に R2 からバックアップを選択してリストアできます。

## トラブルシューティング

### ワークフローが失敗する場合

1. **Secrets の確認**:
   - すべての Secrets が正しく設定されているか確認
   - 特に `R2_SECRET_ACCESS_KEY` は一度しか表示されないので注意

2. **Supabase 接続エラー**:
   ```
   error: connection to server failed
   ```
   - `SUPABASE_PROJECT_REF` が正しいか確認
   - `SUPABASE_DB_PASSWORD` が正しいか確認

3. **R2 アップロードエラー**:
   ```
   error: failed to upload
   ```
   - `R2_ACCOUNT_ID` が正しいか確認
   - R2 API トークンの権限を確認（Read & Write）
   - バケット名が正しいか確認

### GitHub Actions の無料枠

- **無料枠**: 月2,000分（パブリックリポジトリは無制限）
- **バックアップ実行時間**: 約3-5分/回
- **月間実行回数**: 毎日1回 = 30回
- **月間使用時間**: 約90-150分（無料枠内で十分）

### ログの確認

GitHub Actions の各ステップで詳細なログが出力されます:

```
✅ Database dump successful
✅ Upload to R2 successful
✅ Cleanup completed
```

## セキュリティ

- ✅ すべての認証情報は GitHub Secrets で暗号化
- ✅ バックアップファイルは R2 で暗号化保存
- ✅ ワークフローログには機密情報を出力しない
- ✅ R2 API トークンは最小権限（Object Read & Write のみ）

## コスト

### GitHub Actions
- **無料枠**: 月2,000分
- **予想使用量**: 月150分以内
- **コスト**: **無料**

### Cloudflare R2
- **ストレージ**: 10 GB まで無料
- **バックアップサイズ**: 約50MB/日（圧縮後）
- **月間使用量**: 約1.5 GB（30日分）
- **コスト**: **無料**

## まとめ

✅ VPS の IPv6 問題を完全に回避  
✅ GitHub Actions の無料枠内で運用可能  
✅ 毎日自動バックアップ + 30日保持  
✅ 手動実行も可能  
✅ ログ管理が簡単  

このシステムにより、安定した自動バックアップ環境が構築されます。
