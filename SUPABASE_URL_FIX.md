# SUPABASE_URL読み取り問題の修正手順

## 問題の原因

Botを更新すると`SUPABASE_URL`が読み取れなくなり、Workerを再デプロイすると解消される問題の原因：

1. **SUPABASE_URLがsecretと環境変数の両方で設定されていた**
   - GitHub ActionsでCloudflareに`wrangler secret put`で登録
   - 同時にデプロイ時に`--var SUPABASE_URL`で環境変数としても設定
   
2. **Cloudflareのsecretの優先順位**
   - secretと環境変数が両方ある場合、secretが優先される
   - secretは暗号化されており、Workerのコールドスタート時に復号化が必要
   - コールドスタートや復号化のタイミングで読み取りエラーが発生していた

3. **Worker再デプロイで解消される理由**
   - 再デプロイでWorkerインスタンスが完全リセット
   - secretが再度読み込まれキャッシュが更新される

## 実施した修正

### 1. GitHub Actionsワークフローの修正
ファイル: `.github/workflows/deploy-cloudflare-workers.yml`

```diff
  # register secrets (read from env variables passed to this step)
  register_secret DISCORD_CLIENT_SECRET DISCORD_CLIENT_SECRET
  register_secret JWT_SECRET JWT_SECRET
- register_secret SUPABASE_URL SUPABASE_URL
+ # SUPABASE_URL は --var で渡すため、secretとして登録しない
+ # register_secret SUPABASE_URL SUPABASE_URL
  register_secret SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY
```

→ `SUPABASE_URL`をsecretとして登録しないように変更

### 2. wrangler.tomlの更新
ファイル: `backend/wrangler.toml`

```toml
[vars]
SUPABASE_URL = "placeholder"  # デプロイ時に --var で上書きされる
```

→ `SUPABASE_URL`を環境変数として明示的に定義

### 3. 既存のsecretを削除（手動作業が必要）

以下のコマンドで、Cloudflareに登録済みの`SUPABASE_URL` secretを削除してください：

```powershell
cd backend
npx wrangler secret delete SUPABASE_URL
```

または、Cloudflareダッシュボードから削除：
1. https://dash.cloudflare.com にアクセス
2. Workers & Pages → rectbot-backend を選択
3. Settings → Variables and Secrets
4. `SUPABASE_URL`を見つけて削除

## 修正後の動作

- `SUPABASE_URL`は環境変数（vars）としてのみ設定される
- secretではないため、暗号化・復号化のオーバーヘッドなし
- Workerのコールドスタート時も安定して読み取れる
- Bot更新後もWorker再デプロイ不要

## 次回のデプロイで自動適用

修正をコミット&プッシュすると、次回のGitHub Actions実行時に：
1. `SUPABASE_URL`がsecretとして登録されなくなる
2. `--var SUPABASE_URL`で環境変数として設定される
3. 既存のsecretは残るが、環境変数が優先されるようになる（要：手動削除）

## 確認方法

デプロイ後、以下のコマンドで設定を確認：

```powershell
cd backend
# Secret一覧を確認（SUPABASE_URLがないことを確認）
npx wrangler secret list

# 環境変数を確認（wrangler.tomlの [vars] セクション）
cat wrangler.toml
```

## 補足：なぜSUPABASE_URLはsecretではないのか

- SupabaseのプロジェクトURLは公開情報（例: `https://xxxxx.supabase.co`）
- フロントエンドのJavaScriptコードにも含まれる
- 機密情報は`SUPABASE_SERVICE_ROLE_KEY`（これはsecretのまま）
- 公開URLを暗号化する意味がない

## 関連ファイル

- `.github/workflows/deploy-cloudflare-workers.yml` - CI/CDパイプライン
- `backend/wrangler.toml` - Worker設定ファイル
- `backend/src/worker/supabase.js` - SUPABASE_URL使用箇所
- `bot/src/config.js` - Bot側の環境変数読み込み
- `bot/.env` - Bot側のローカル設定（機密情報のため非公開）
