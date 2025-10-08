# バックアップシステム構築 - 変更サマリー

## 📦 追加されたファイル

### 1. バックアップスクリプト（3ファイル）

| ファイル | 説明 | 用途 |
|---------|------|------|
| `backup_supabase_to_r2.sh` | メインバックアップスクリプト | pg_dump → gzip → R2アップロード |
| `restore_from_r2.sh` | 復元スクリプト | R2ダウンロード → 解凍 → psql復元 |
| `deploy_backup_to_vps.sh` | VPSデプロイスクリプト（手動用） | ローカルからVPSへファイル転送 |

### 2. ドキュメント（2ファイル）

| ファイル | 説明 |
|---------|------|
| `BACKUP_SETUP_GUIDE.md` | バックアップシステム完全セットアップガイド |
| `GITHUB_SECRETS_SETUP.md` | GitHub Secrets 登録手順（詳細） |

### 3. 環境変数テンプレート

| ファイル | 説明 |
|---------|------|
| `.env.backup.example` | バックアップ用環境変数テンプレート |

---

## 🔧 変更されたファイル

### 1. `.github/workflows/deploy-oci.yml`

**変更内容**:
- バックアップスクリプトのパス変更を監視対象に追加
- GitHub Secrets からバックアップ関連環境変数を読み込み
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_DB_PASSWORD`
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME`
- VPS デプロイ時に `.env.backup` を自動生成
- バックアップスクリプトに実行権限を付与
- `backups/` ディレクトリを自動作成

**デプロイフロー**:
```
Git Push → GitHub Actions
  ↓
VPS にログイン
  ↓
git pull（最新コード取得）
  ↓
Bot デプロイ（PM2再起動）
  ↓
.env.backup 生成（GitHub Secrets → VPS）
  ↓
スクリプト権限設定
  ↓
バックアップシステム準備完了
```

### 2. `.gitignore`

**追加内容**:
```gitignore
# バックアップ関連
.env.backup
backups/
backup.log
*.sql
*.sql.gz
```

機密情報とバックアップファイルを Git 管理外に設定。

### 3. `README.md`

**追加内容**:
- 使用サービス一覧に「Cloudflare R2（バックアップ）」を追加
- バックアップシステムのセクションを追加
  - 機能説明
  - セットアップ手順
  - 緊急時の復元方法

---

## 🔒 セキュリティ改善

### GitHub Secrets 経由での環境変数管理

**変更前（問題）**:
- 環境変数を VPS 上で手動管理
- 機密情報が平文でサーバーに保存
- デプロイ時に手動設定が必要

**変更後（改善）**:
- GitHub Secrets で一元管理
- GitHub Actions が自動的に VPS に送信
- `.env.backup` は `chmod 600` で保護
- Git にコミットされない（.gitignore 設定済み）

### 機密情報の保護レイヤー

```
GitHub Secrets（暗号化）
  ↓ GitHub Actions（一時的に復号化）
  ↓ SSH経由で VPS に送信
  ↓ .env.backup（chmod 600、所有者のみ読み書き可）
  ↓ バックアップスクリプトで読み込み
```

---

## 📋 必要なアクション（ユーザー側）

### 1. Cloudflare R2 バケット作成

```
https://dash.cloudflare.com/ → R2 → Create bucket
バケット名: rectbot-supabase-backups
ロケーション: Asia-Pacific (APAC)
```

### 2. R2 API トークン作成

```
Manage R2 API Tokens → Create API Token
権限: Admin Read & Write
```

### 3. Supabase 接続情報取得

```
Settings → General → Reference ID
Settings → Database → Database Password
```

### 4. GitHub Secrets に登録（6つ）

詳細は `GITHUB_SECRETS_SETUP.md` を参照。

```
SUPABASE_PROJECT_REF
SUPABASE_DB_PASSWORD
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

### 5. VPS で PostgreSQL クライアントと AWS CLI をインストール

```bash
sudo apt update
sudo apt install -y postgresql-client awscli
```

### 6. Cron ジョブ設定（毎日午前3時）

```bash
crontab -e

# 以下を追加
0 3 * * * cd /home/ubuntu/rectbot && /bin/bash backup_supabase_to_r2.sh >> /home/ubuntu/rectbot/backup.log 2>&1
```

---

## ✅ 動作確認

### 1. GitHub Actions が成功するか

```
GitHub リポジトリ → Actions → Deploy to OCI
最新の実行が ✅ Success になっているか確認
```

### 2. VPS で `.env.backup` が作成されているか

```bash
ssh ubuntu@<vps-ip>
cd ~/rectbot
ls -lah .env.backup  # 権限が rw------- (600) か確認
cat .env.backup      # 内容を確認
```

### 3. バックアップスクリプトをテスト実行

```bash
./backup_supabase_to_r2.sh
tail -f backup.log
```

### 4. R2 バケットにファイルが存在するか

```
Cloudflare Dashboard → R2 → rectbot-supabase-backups
バックアップファイル（*.sql.gz）が存在することを確認
```

---

## 🎯 期待される結果

### 自動化されたバックアップフロー

```
毎日午前3時（Cron）
  ↓
Supabase から pg_dump
  ↓
gzip で圧縮（最大圧縮率）
  ↓
Cloudflare R2 にアップロード
  ↓
ローカルファイル削除
  ↓
30日以前のバックアップを自動削除
  ↓
ログに記録
```

### 緊急時の復元

```bash
# VPS で実行
./restore_from_r2.sh

# インタラクティブに選択
[1] supabase_backup_20251008_030000.sql.gz (最新)
[2] supabase_backup_20251007_030000.sql.gz
[3] supabase_backup_20251006_030000.sql.gz
...

復元するバックアップの番号を入力: 1

# 確認プロンプト
⚠️  警告: このバックアップで Supabase データベースを上書きします
続行しますか? (yes/no): yes

# 自動復元
R2からダウンロード → 解凍 → Supabase に復元 → 完了
```

---

## 📊 コスト

すべて**無料枠で運用可能**:

- Cloudflare R2: 10GB 無料（30日分のバックアップで十分）
- PostgreSQL Client: オープンソース
- AWS CLI: オープンソース
- GitHub Actions: Public リポジトリは無料
- OCI VPS Cron: 追加コストなし

---

## 🎉 完了！

これで**完全自動化されたバックアップシステム**が構築されました：

✅ GitHub Secrets で機密情報を安全管理
✅ GitHub Actions で自動デプロイ
✅ Cron で毎日自動バックアップ
✅ 30日間の履歴保持
✅ ワンコマンドで復元可能
✅ 完全無料で運用

次のステップ:
1. GitHub Secrets を登録
2. Git にコミット & プッシュ
3. GitHub Actions のログを確認
4. VPS でバックアップをテスト実行
5. Cron ジョブを設定

詳細は各ガイドを参照してください！
