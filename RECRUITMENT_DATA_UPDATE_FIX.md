# 🔧 管理画面の募集データ更新問題の修正ガイド

## 問題の症状
管理画面にアクセスできるが、新しい募集が立っても総募集数が更新されない。

## 原因
バックエンドAPIが**テストデータ（ハードコードされた固定データ）**を返していたため、実際のRedisに保存されている募集データが取得されていませんでした。

---

## ✅ 実施した修正

### 1. バックエンドAPIの実装変更
`/api/recruitment/list` エンドポイントを、Redisから実際のデータを取得するように変更しました。

#### 変更内容:
- **変更前**: 固定のテストデータを返す
- **変更後**: Upstash Redis REST API を使用して実際の募集データを取得

### 2. フロントエンドのデバッグログ強化
取得したデータ件数や内容をコンソールに出力するように改善しました。

---

## 🔑 必要な環境変数

バックエンド（Cloudflare Workers）に以下の環境変数を設定する必要があります:

### Upstash Redis の設定

1. **UPSTASH_REDIS_REST_URL**
   - Upstash Redis の REST API エンドポイント
   - 例: `https://your-redis.upstash.io`

2. **UPSTASH_REDIS_REST_TOKEN**
   - Upstash Redis の認証トークン
   - 例: `AXX0AAIncDE...`

---

## 📝 環境変数の設定手順

### Cloudflare Dashboard での設定

1. https://dash.cloudflare.com/ にログイン
2. **Workers & Pages** をクリック
3. **rectbot-backend** (または該当するWorker名) をクリック
4. **Settings** タブをクリック
5. **Variables** セクションを開く
6. **Add variable** をクリックして以下を追加:

#### UPSTASH_REDIS_REST_URL の設定
- Variable name: `UPSTASH_REDIS_REST_URL`
- Value: Upstash Redis の REST URL（Upstash ダッシュボードから取得）
- Type: `Text`（Secretにはしない）

#### UPSTASH_REDIS_REST_TOKEN の設定
- Variable name: `UPSTASH_REDIS_REST_TOKEN`
- Value: Upstash Redis の REST トークン（Upstash ダッシュボードから取得）
- Type: `Secret`（**必ずSecretにする**）

7. **Save** をクリック

### Upstash Redis の取得方法

もしまだ Upstash Redis の認証情報を取得していない場合:

1. https://console.upstash.com/ にログイン
2. 使用しているRedisデータベースをクリック
3. **REST API** タブを開く
4. 以下の情報をコピー:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## 🚀 デプロイ手順

環境変数を設定した後、Workerを再デプロイします:

```bash
cd /workspaces/rectbot/backend
wrangler deploy
```

フロントエンドも再デプロイ（必要に応じて）:

```bash
cd /workspaces/rectbot/frontend/dashboard
# デプロイコマンドを実行
```

---

## 🔍 動作確認

### 1. ブラウザのコンソールで確認

管理画面を開いて F12 キーを押し、Console タブを開きます。

以下のようなログが表示されれば正常です:

```
Fetching recruitments from: https://api.rectbot.tech/api/recruitment/list
Fetched 5 recruitments from API
Recruitment data: [...]
Total recruitments: 5
Active recruitments: 3
Unique guilds: 2
```

### 2. 自動更新の確認

- 管理画面は **5秒ごと** に自動的にデータを更新します
- 「最終更新」の時刻が5秒ごとに更新されることを確認

### 3. 新しい募集を立ててテスト

1. Discordで新しい募集を立てる
2. 最大5秒待つ（自動更新のタイミング）
3. 管理画面の「総募集数」が増えることを確認

---

## 🐛 トラブルシューティング

### 問題1: 「総募集数: 0」のまま変わらない

#### 原因: Redis環境変数が設定されていない

**確認方法:**
1. Cloudflare Dashboard → Workers & Pages → rectbot-backend → Settings → Variables
2. `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` が存在するか確認

**解決策:**
- 上記の「環境変数の設定手順」に従って設定
- Workerを再デプロイ

### 問題2: Redisにデータが保存されていない

#### 原因: Botが正しくRedisに保存していない

**確認方法:**
1. Upstash Console にログイン
2. Redis データベースを選択
3. **Data Browser** タブを開く
4. `recruit:*` パターンでキーを検索

**解決策:**
- Botの環境変数（`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`）を確認
- Botを再起動

### 問題3: コンソールにエラーが表示される

#### エラー例1: "Failed to scan Redis keys: 401"
- **原因**: `UPSTASH_REDIS_REST_TOKEN` が間違っている
- **解決策**: Upstash Console から正しいトークンを再取得して設定

#### エラー例2: "Redis not configured, returning empty list"
- **原因**: 環境変数が設定されていない
- **解決策**: 上記の設定手順を実行

#### エラー例3: "Error fetching recruitments: TypeError"
- **原因**: API呼び出しに失敗している
- **解決策**: ブラウザのキャッシュをクリアして再読み込み

---

## 📊 データの流れ

正常な動作時のデータフロー:

```
1. ユーザーがDiscordで募集を立てる
   ↓
2. BotがRedisに募集データを保存
   ↓
3. 管理画面が5秒ごとに /api/recruitment/list を呼び出す
   ↓
4. WorkerがUpstash Redis REST APIでデータを取得
   ↓
5. 管理画面に最新のデータが表示される
```

---

## 🎯 期待される動作

修正とRedis設定完了後:

1. **リアルタイム更新**
   - 5秒ごとに自動でデータが更新される
   - 「最終更新」時刻が更新される

2. **新規募集の反映**
   - Discord で新しい募集が立つ
   - 最大5秒以内に管理画面に表示される
   - 総募集数が自動的にカウントアップされる

3. **募集ステータスの更新**
   - 募集が締め切られると「アクティブ募集」が減る
   - 総募集数には過去の募集も含まれる

4. **複数サーバー対応**
   - 複数のDiscordサーバーの募集を一覧表示
   - 「導入サーバー数」が正しくカウントされる

---

## 📝 デバッグ用コマンド

### Redisのキーを確認
```bash
# Upstash Console の CLI タブで実行
SCAN 0 MATCH recruit:* COUNT 100
```

### 特定の募集データを確認
```bash
# Upstash Console の CLI タブで実行
GET recruit:123456789012345678
```

### 環境変数を確認（ローカル開発）
```bash
cd /workspaces/rectbot/backend
cat wrangler.toml | grep -E "REDIS|UPSTASH"
```

---

## ✅ チェックリスト

修正が完了したら、以下を確認してください:

- [ ] `UPSTASH_REDIS_REST_URL` を Cloudflare Workers に設定した
- [ ] `UPSTASH_REDIS_REST_TOKEN` を Cloudflare Workers に設定した（Secret として）
- [ ] Worker を再デプロイした（`wrangler deploy`）
- [ ] 管理画面を開いて F12 → Console を確認した
- [ ] コンソールに「Fetched X recruitments from API」と表示される
- [ ] Discord で新しい募集を立てた
- [ ] 5秒以内に管理画面に反映された
- [ ] 総募集数が正しくカウントされている

---

## 💡 補足: Redis の代わりに Supabase を使う場合

現在の実装は Redis を使用していますが、将来的に Supabase に移行する場合は、以下のような実装に変更できます:

```javascript
// Supabase から募集データを取得
const response = await fetch(
  `${env.SUPABASE_URL}/rest/v1/recruitments?select=*&status=eq.recruiting`,
  {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  }
);
```

ただし、現時点では **Redis を使用することを推奨** します（高速で、既存のBot実装と互換性があるため）。
