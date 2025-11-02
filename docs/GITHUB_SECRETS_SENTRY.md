# GitHub Secrets 設定ガイド - Sentry統合

## 📋 必要なシークレット

GitHub Actionsで自動デプロイ時にSentry監視を有効にするため、以下のシークレットを設定してください。

## 🔧 設定手順

### 1. Sentry Auth Token を取得

1. https://rectbot.sentry.io にアクセス
2. **Settings** → **Account** → **API** → **Auth Tokens**
3. **Create New Token** をクリック
4. トークン名を入力（例: `grafana-monitoring`）
5. 以下の権限を選択:
   - ✅ **Project: Read**
   - ✅ **Event: Read**
   - ✅ **Organization: Read**
6. **Create Token** をクリック
7. 表示されたトークンをコピー（このトークンは一度しか表示されません）

### 2. GitHub Secretsに追加

1. GitHubリポジトリ `PK-2736/rectbot` を開く
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** をクリック
4. 以下を入力:
   - **Name**: `SENTRY_AUTH_TOKEN`
   - **Secret**: 上記でコピーしたトークン
5. **Add secret** をクリック

### 3. 既存のシークレット確認

以下のシークレットが既に設定されているか確認してください:

| シークレット名 | 説明 | 必須 |
|---------------|------|------|
| `SENTRY_AUTH_TOKEN` | Sentry認証トークン | ✅ 新規追加 |
| `GRAFANA_ADMIN_USER` | Grafana管理者ユーザー名 | ✅ |
| `GRAFANA_ADMIN_PASSWORD` | Grafana管理者パスワード | ✅ |
| `OCI_SSH_KEY` | OCIサーバーSSH秘密鍵 | ✅ |
| `OCI_HOST` | OCIサーバーホスト名 | ✅ |
| `OCI_USER` | OCIサーバーユーザー名 | ✅ |
| `DISCORD_BOT_TOKEN` | Discord Bot トークン | ✅ |
| `SERVICE_TOKEN` | バックエンドAPIトークン | ✅ |

## 🚀 デプロイフロー

GitHub Actionsワークフローは以下の処理を自動実行します:

```yaml
1. コードをチェックアウト
2. SSH接続を確立
3. 環境変数を設定:
   - SENTRY_AUTH_TOKEN
   - GRAFANA_ADMIN_USER
   - GRAFANA_ADMIN_PASSWORD
4. .env ファイルを生成
5. 監視スタックをデプロイ:
   - Grafana (Sentryプラグイン付き)
   - Prometheus
   - Loki
   - Promtail
   - Node Exporter
   - cAdvisor
6. Botをデプロイ
```

## 📊 デプロイ後の確認

デプロイが完了したら、以下を確認してください:

### Grafanaにアクセス
```
https://grafana.recrubo.net
```

### Sentryデータソースの確認
1. **Configuration** → **Data sources**
2. **Sentry** をクリック
3. ステータスが **OK** になっていることを確認

### ダッシュボードの確認
1. **Dashboards** メニュー
2. 以下のダッシュボードが表示されることを確認:
   - 🔴 **Sentryエラー監視**
   - 🖥️ **システムリソース監視**
   - 📋 **募集状況ダッシュボード**
   - 📊 **PM2 Advanced Logs**

## ⚠️ トラブルシューティング

### Sentryデータソースが接続できない

**症状**: "403 Forbidden" エラー

**対処法**:
1. `SENTRY_AUTH_TOKEN` の権限を確認
2. トークンが有効期限切れでないか確認
3. 新しいトークンを作成して再設定

**手動で確認**:
```bash
ssh ubuntu@your-oci-server
cat ~/rectbot/.env | grep SENTRY_AUTH_TOKEN
```

### GitHub Actionsでデプロイが失敗

**ログ確認**:
1. GitHubリポジトリ → **Actions** タブ
2. 最新のワークフロー実行をクリック
3. **oci-deploy** ジョブのログを確認

**よくあるエラー**:
- `SENTRY_AUTH_TOKEN` が設定されていない
  → GitHub Secretsを確認
- SSH接続エラー
  → `OCI_SSH_KEY` の内容を確認

## 🔄 トークンの更新

Sentryトークンを更新する場合:

1. 新しいトークンをSentryで作成
2. GitHub Secretsの `SENTRY_AUTH_TOKEN` を更新
3. 次回のプッシュで自動的に新しいトークンが適用される

または手動でOCIサーバーを更新:
```bash
ssh ubuntu@your-oci-server
cd ~/rectbot
echo "SENTRY_AUTH_TOKEN=new-token-here" > .env
docker compose -f docker-compose.monitoring.yml restart grafana
```

## 📖 関連ドキュメント

- [Grafana Sentry Setup](./GRAFANA_SENTRY_SETUP.md)
- [Monitoring Setup](./Monitoring.md)
- [GitHub Actions Deploy Workflow](../.github/workflows/deploy-oci.yml)

---

**最終更新**: 2025-11-02
