# 🔧 Grafana データソース認証トラブルシューティング

## 問題: `401 Unauthorized` または `{"error": "unauthorized"}`

Grafana で Cloudflare Workers API (`/api/grafana/recruits`) にアクセスすると認証エラーが発生する。

### ログに表示されるエラー例

```
logger=plugin.yesoreyeram-infinity-datasource ... msg="401 Unauthorized"
```

```bash
$ curl https://api.recrubo.net/api/grafana/recruits
{"error": "unauthorized"}
```

## 原因

Grafana データソースが API にアクセスする際の Bearer Token が:
1. **設定されていない**
2. **Cloudflare Worker の `GRAFANA_ACCESS_TOKEN` と一致していない**

## 解決手順

### 1️⃣ トークンを生成・設定

```bash
cd /path/to/rectbot

# トークン設定スクリプトを実行
./scripts/setup-grafana-token.sh
```

または手動で:

```bash
# 1. 安全なトークンを生成
TOKEN=$(openssl rand -hex 32)
echo "Generated token: $TOKEN"

# 2. .env ファイルに追加
echo "" >> .env
echo "# Grafana データソース用トークン" >> .env
echo "GRAFANA_TOKEN=$TOKEN" >> .env
```

### 2️⃣ Cloudflare Worker にトークンを設定

**方法A: Wrangler CLI を使用**

```bash
cd backend
wrangler secret put GRAFANA_ACCESS_TOKEN
# プロンプトが表示されたら、.env の GRAFANA_TOKEN と同じ値を貼り付け
```

**方法B: Cloudflare Dashboard を使用**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. **Workers & Pages** → あなたの Worker を選択
3. **Settings** → **Variables and Secrets**
4. **Add variable**:
   - Variable name: `GRAFANA_ACCESS_TOKEN`
   - Type: **Secret** (encrypted)
   - Value: `.env` の `GRAFANA_TOKEN` と同じ値
5. **Save and Deploy**

### 3️⃣ Grafana を再起動

```bash
# docker-compose で再起動
docker-compose -f docker-compose.monitoring.yml restart grafana

# または完全に再起動
docker-compose -f docker-compose.monitoring.yml down
docker-compose -f docker-compose.monitoring.yml up -d
```

### 4️⃣ 接続テスト

```bash
# トークンを取得
TOKEN=$(grep GRAFANA_TOKEN .env | cut -d= -f2)

# API にアクセステスト
curl -H "Authorization: Bearer $TOKEN" \
     https://api.recrubo.net/api/grafana/recruits

# 成功すると JSON 配列が返る
# [{"id":"...","title":"...","game":"...","platform":"...",...}]
```

## 確認チェックリスト

- [ ] `.env` に `GRAFANA_TOKEN` が設定されている
- [ ] Cloudflare Worker に `GRAFANA_ACCESS_TOKEN` が設定されている
- [ ] 両方のトークンが **完全に一致** している
- [ ] Grafana コンテナが再起動されている
- [ ] `curl` テストで 200 OK が返る

## トラブルシューティング

### エラー: `WARN The "GRAFANA_TOKEN" variable is not set`

**原因**: `.env` ファイルに `GRAFANA_TOKEN` がない

**解決**:
```bash
# .env にトークンを追加
echo "GRAFANA_TOKEN=$(openssl rand -hex 32)" >> .env
```

### エラー: `401 Unauthorized` が続く

**原因**: トークンの不一致または Worker への反映遅延

**解決**:
```bash
# 1. トークン値を確認
grep GRAFANA_TOKEN .env

# 2. Cloudflare Worker の環境変数を確認
cd backend
wrangler secret list

# 3. トークンを再設定
wrangler secret put GRAFANA_ACCESS_TOKEN
# .env の値を貼り付け

# 4. Worker をデプロイ
wrangler deploy

# 5. 数分待ってから再テスト
```

### エラー: `404 Not Found`

**原因**: データソースの URL 設定が間違っている

**解決**:
1. Grafana UI → **Configuration** → **Data Sources**
2. **Cloudflare-Recruits-API** を選択
3. **URL** を確認: `https://api.recrubo.net` （パスなし）
4. Query URL はパネル設定で `/api/grafana/recruits` を指定

## 設定ファイル参照

### Grafana データソース設定
```yaml
# docker/monitoring/grafana/provisioning/datasources/datasources.yml
- name: Cloudflare-Recruits-API
  uid: cloudflare-recruits-api
  type: yesoreyeram-infinity-datasource
  url: https://api.recrubo.net
  jsonData:
    auth_method: bearer
  secureJsonData:
    bearerToken: ${GRAFANA_TOKEN}  # .env から読み込み
```

### Worker 認証コード
```javascript
// backend/src/worker/routes/recruitment.js
const grafanaToken = env.GRAFANA_ACCESS_TOKEN;
if (grafanaToken) {
  const providedToken = request.headers.get('x-grafana-token') 
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!providedToken || providedToken !== grafanaToken) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), 
      { status: 401 });
  }
}
```

## 関連ドキュメント

- [Grafana 募集状況ダッシュボード](./GRAFANA_RECRUITS_DASHBOARD.md)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/commands/)

## ヘルプ

問題が解決しない場合:
1. Grafana ログを確認: `docker-compose -f docker-compose.monitoring.yml logs grafana`
2. Worker ログを確認: Cloudflare Dashboard → Workers → Logs
3. Issue を作成: [GitHub Issues](https://github.com/your-repo/issues)
