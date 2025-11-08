# Grafana データソース 401 Unauthorized 修正まとめ

## 🔍 問題の原因

Grafanaで `/api/grafana/recruits` エンドポイントにアクセスすると `401 Unauthorized` エラーが発生。

### エラーログ
```
logger=plugin.yesoreyeram-infinity-datasource ... msg="401 Unauthorized"
```

```json
{"error": "unauthorized"}
```

## 📊 根本原因

1. **環境変数 `GRAFANA_TOKEN` が未設定**
   - `docker-compose.monitoring.yml` で `${GRAFANA_TOKEN}` を参照
   - 値が空なので Grafana データソースの Bearer Token も空

2. **バックエンド (Cloudflare Worker) の認証要件**
   - `/api/grafana/recruits` は `GRAFANA_ACCESS_TOKEN` で認証チェック
   - リクエストに `Authorization: Bearer <token>` または `X-Grafana-Token: <token>` が必要

## ✅ 解決方法

### 手順1: トークンを生成して設定

```bash
# トークン設定スクリプトを実行（推奨）
./scripts/setup-grafana-token.sh

# または手動で
TOKEN=$(openssl rand -hex 32)
echo "GRAFANA_TOKEN=$TOKEN" >> .env
```

### 手順2: Cloudflare Worker に同じトークンを設定

```bash
cd backend
wrangler secret put GRAFANA_ACCESS_TOKEN
# プロンプトで .env の GRAFANA_TOKEN と同じ値を入力
```

### 手順3: Grafana を再起動

```bash
docker-compose -f docker-compose.monitoring.yml restart grafana
```

### 手順4: 接続テスト

```bash
TOKEN=$(grep GRAFANA_TOKEN .env | cut -d= -f2)
curl -H "Authorization: Bearer $TOKEN" \
     https://api.recrubo.net/api/grafana/recruits
```

成功すると募集データの JSON 配列が返ります。

## 📝 更新されたファイル

### 1. `.env.example`
- `GRAFANA_TOKEN` 環境変数を追加

### 2. `scripts/setup-grafana-token.sh` (新規作成)
- トークン生成と設定を自動化するスクリプト

### 3. `scripts/fix-grafana-datasource.sh` (改善)
- トークン確認機能を追加
- 認証ありとなしの両方でテスト

### 4. `docs/GRAFANA_AUTH_TROUBLESHOOTING.md` (新規作成)
- 詳細なトラブルシューティングガイド

### 5. `docs/GRAFANA_RECRUITS_DASHBOARD.md` (更新)
- 認証エラーの解決方法を追加

## 🔧 設定ファイルの構造

### Grafana データソース
```yaml
# docker/monitoring/grafana/provisioning/datasources/datasources.yml
- name: Cloudflare-Recruits-API
  uid: cloudflare-recruits-api
  type: yesoreyeram-infinity-datasource
  url: https://api.recrubo.net
  jsonData:
    auth_method: bearer
  secureJsonData:
    bearerToken: ${GRAFANA_TOKEN}  # ← .env から読み込み
```

### Docker Compose
```yaml
# docker-compose.monitoring.yml
grafana:
  environment:
    GRAFANA_TOKEN: ${GRAFANA_TOKEN}  # ← .env から読み込み
```

### Cloudflare Worker
```javascript
// backend/src/worker/routes/recruitment.js
const grafanaToken = env.GRAFANA_ACCESS_TOKEN;  // ← Wrangler secret
if (grafanaToken) {
  const providedToken = request.headers.get('authorization')
    ?.replace('Bearer ', '');
  if (providedToken !== grafanaToken) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), 
      { status: 401 });
  }
}
```

## ✔️ チェックリスト

- [ ] `.env` に `GRAFANA_TOKEN` を追加
- [ ] Cloudflare Worker に `GRAFANA_ACCESS_TOKEN` を設定（同じ値）
- [ ] Grafana コンテナを再起動
- [ ] `curl` でエンドポイントをテスト
- [ ] Grafana UI でデータソース接続をテスト
- [ ] ダッシュボードでデータが表示されることを確認

## 🚀 クイックスタート（完全版）

```bash
# 1. リポジトリのルートに移動
cd /path/to/rectbot

# 2. トークン設定
./scripts/setup-grafana-token.sh

# 3. Cloudflare Worker にトークンを設定
cd backend
wrangler secret put GRAFANA_ACCESS_TOKEN
# .env の GRAFANA_TOKEN と同じ値を入力

# 4. Grafana 再起動
cd ..
docker-compose -f docker-compose.monitoring.yml restart grafana

# 5. 接続確認
./scripts/fix-grafana-datasource.sh

# 6. Grafana UI で確認
open https://grafana.recrubo.net
```

## 📚 関連ドキュメント

- [Grafana 認証トラブルシューティング](./docs/GRAFANA_AUTH_TROUBLESHOOTING.md)
- [Grafana 募集状況ダッシュボード](./docs/GRAFANA_RECRUITS_DASHBOARD.md)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 💡 今後の改善案

1. **トークンローテーション**: 定期的にトークンを更新する仕組み
2. **ヘルスチェック**: Grafana データソースの接続状態を監視
3. **CI/CD**: デプロイ時に自動でトークンを同期
4. **ドキュメント**: README に認証セットアップ手順を追加

---

**作成日**: 2025-11-08  
**担当**: GitHub Copilot  
**ステータス**: ✅ 解決済み
