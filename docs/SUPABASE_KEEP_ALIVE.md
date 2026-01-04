# Supabase Keep-Alive Setup

## 概要

Supabaseの無料枠は、一定期間アクティビティがないとプロジェクトが凍結（一時停止）される可能性があります。このGitHub Actionsワークフローは、定期的にSupabaseデータベースにアクセスすることで、凍結を回避します。

## アーキテクチャ

```
┌─────────────────────┐
│ GitHub Actions      │
│ (定期実行)          │
└──────┬──────────────┘
       │ 毎日00:00 UTC
       │ (JST 09:00)
       ▼
┌─────────────────────┐     curlコマンドで
│                     │     データを送信
│  Supabase           │◄────────────┐
│  (your project)     │              │
│                     │              │
└──────┬──────────────┘              │
       │                             │
       │ 実行成功を通知              │
       ▼                             │
┌─────────────────────┐              │
│ Discord Webhook     │              │
│ (通知先)            │              │
└─────────────────────┘              │
                                     │
                            keep_alive()関数を呼び出し
```

## セットアップ手順

### 1. Supabase側の設定

マイグレーションファイルを実行して、`keep_alive`関数を作成します。

```bash
# Supabaseダッシュボードの SQL Editor で以下を実行
# または、Supabase CLIを使用
supabase db push
```

マイグレーションファイル: `migrations/20260104_add_keep_alive_function.sql`

この関数は以下の情報を返します：
- `status`: "ok"
- `timestamp`: 現在時刻
- `database`: データベース名
- `version`: PostgreSQLバージョン

### 2. GitHub Secretsの設定

以下のシークレットがGitHubリポジトリに設定されている必要があります：

| シークレット名 | 説明 | 取得方法 |
|---------------|------|---------|
| `SUPABASE_URL` | SupabaseプロジェクトのURL | Supabaseダッシュボード > Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Roleキー | Supabaseダッシュボード > Settings > API > service_role (secret) |

### 3. ワークフローの有効化

ワークフローファイル: `.github/workflows/keep-supabase-active.yml`

このワークフローは自動的に以下のタイミングで実行されます：
- **毎日00:00 UTC (日本時間 午前9時)**
- 手動実行も可能（GitHub Actions タブから）

### 4. Discord通知の設定

実行結果は指定されたDiscord Webhookに通知されます。

**Webhook URL**: 
```
https://discord.com/api/webhooks/1426044588740710460/RElua00Jvi-937tbGtwv9wfq123mdff097HvaJgb-qILNsc79yzei9x8vZrM2OKYsETI
```

通知内容：
- ✅ **成功時**: 緑色の埋め込みメッセージ
  - 実行時刻
  - HTTPステータスコード
  - ワークフローへのリンク
- ❌ **失敗時**: 赤色の埋め込みメッセージ
  - 実行時刻
  - ワークフローへのリンク

## 動作フロー

1. **GitHub Actions がトリガー**
   - スケジュール: 毎日00:00 UTC
   - または手動実行

2. **Supabaseへのアクセス**
   - まず `keep_alive()` RPC関数を呼び出し
   - 404エラーの場合は、代替方法として `guild_settings` テーブルから1件取得

3. **Discord通知の送信**
   - 成功時: 緑色の埋め込みメッセージ
   - 失敗時: 赤色の埋め込みメッセージ

## 手動実行方法

1. GitHubリポジトリにアクセス
2. **Actions** タブをクリック
3. 左サイドバーから **Keep Supabase Active** を選択
4. **Run workflow** ボタンをクリック
5. **Run workflow** を確認

## トラブルシューティング

### keep_alive関数が404エラーになる場合

ワークフローは自動的に代替方法（guild_settingsテーブルへのSELECTクエリ）にフォールバックします。

手動でマイグレーションを実行する場合：

```sql
-- Supabase SQL Editorで実行
CREATE OR REPLACE FUNCTION public.keep_alive()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'status', 'ok',
    'timestamp', now(),
    'database', current_database(),
    'version', version()
  ) INTO result;
  
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.keep_alive() TO anon;
GRANT EXECUTE ON FUNCTION public.keep_alive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.keep_alive() TO service_role;
```

### Discord通知が届かない場合

1. Webhook URLが正しいか確認
2. Webhookが削除されていないか確認
3. GitHub Actionsのログで実際のエラーメッセージを確認

### Supabaseへの接続が失敗する場合

1. `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が正しく設定されているか確認
2. Supabaseプロジェクトが一時停止されていないか確認
3. APIキーが無効化されていないか確認

## 実行ログの確認

GitHub Actionsの実行ログは以下で確認できます：

1. リポジトリの **Actions** タブ
2. **Keep Supabase Active** ワークフローを選択
3. 実行履歴から確認したいrunをクリック

## セキュリティ考慮事項

- `SUPABASE_SERVICE_ROLE_KEY` はGitHub Secretsで安全に管理
- `keep_alive()` 関数は読み取り専用で、データの変更は行わない
- Discord Webhook URLはワークフローファイルに直接記述（必要に応じて環境変数化も可能）

## 関連ファイル

- `.github/workflows/keep-supabase-active.yml` - GitHub Actionsワークフロー
- `migrations/20260104_add_keep_alive_function.sql` - keep_alive関数のSQLマイグレーション
- `docs/SUPABASE_KEEP_ALIVE.md` - このドキュメント
