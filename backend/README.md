# Rectbot Backend - Unified Cloudflare Worker

**統合Cloudflare Worker** - すべてのバックエンドAPIを1つのWorkerで提供

## 🏗️ アーキテクチャ

```
                     Cloudflare Worker (統合)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   Durable Objects      Workers AI          外部サービス
        │               + Vectorize              │
   ├─ Recruits          + D1 (Friend Code)  ├─ Supabase
   └─ InviteTokens                          ├─ Discord OAuth
                                            └─ Sentry
```

## 📡 API エンドポイント

### 募集機能 (Recruitment API)
- `GET /api/recruitments` - 募集一覧取得
- `POST /api/recruitments` - 募集作成
- `GET /api/recruitments/:id` - 募集詳細取得
- `POST /api/recruitments/:id/join` - 募集参加
- `DELETE /api/recruitments/:id` - 募集削除

### フレンドコード機能 (Friend Code API)
- `POST /api/game/normalize` - ゲーム名正規化 (AI)
- `POST /api/friend-code/add` - フレンドコード追加
- `GET /api/friend-code/get` - フレンドコード取得
- `DELETE /api/friend-code/delete` - フレンドコード削除
- `GET /api/game/search` - ゲーム名検索

### 管理機能 (Admin API)
- `POST /api/admin/generate-games` - ゲーム辞書生成 (要認証)

### 認証 & 管理
- `GET /ping` - ヘルスチェック
- `GET /metrics` - Prometheus メトリクス
- その他多数のエンドポイント（詳細は `/src/worker/routes/` 参照）

## 📁 ディレクトリ構成

```
backend/
├── src/
│   ├── index.js                    # メインWorkerエントリーポイント
│   ├── routes/
│   │   └── friend-code/            # Friend Code API
│   │       ├── normalizeGameName.js
│   │       ├── addFriendCode.js
│   │       ├── getFriendCodes.js
│   │       ├── deleteFriendCode.js
│   │       └── searchGameNames.js
│   ├── ai/                         # Workers AI + Vectorize
│   │   ├── llm.js
│   │   └── vectorize.js
│   ├── db/                         # D1 Database
│   │   ├── cache.js
│   │   └── friendCodes.js
│   ├── durable/                    # Durable Objects
│   │   ├── recruits.js
│   │   └── inviteTokens.js
│   ├── worker/                     # 既存のWorker機能
│   │   ├── routes/
│   │   └── utils/
│   └── utils/                      # 共通ユーティリティ
├── scripts/
│   └── generate-game-embeddings.js # ゲーム辞書生成
├── schema-friend-code.sql          # Friend Code用D1スキーマ
├── wrangler.toml                   # Cloudflare設定
└── package.json
```

## 🚀 デプロイ

### 初回セットアップ

```bash
cd backend

# Friend Code用D1データベース作成
wrangler d1 create friendcodes

# 出力されたdatabase_idをwrangler.tomlに設定

# スキーマ初期化
wrangler d1 execute friendcodes --file=./schema-friend-code.sql

# Vectorizeインデックス作成
wrangler vectorize create game-names --dimensions=768 --metric=cosine
```

### デプロイ

```bash
# 本番環境へデプロイ
wrangler deploy

# デプロイ後、ゲーム辞書を生成
curl -X POST https://api.recrubo.net/api/admin/generate-games \
  -H "Authorization: Bearer YOUR_SERVICE_TOKEN"

# または GitHub Actions で自動デプロイ
```

## 🔧 開発

```bash
# ローカル開発サーバー起動
wrangler dev

# ログ確認
wrangler tail --format pretty
```

## 📊 Cloudflare バインディング

### Durable Objects
- `RECRUITS_DO` - 募集データ管理
- `INVITE_TOKENS_DO` - 招待トークン管理

### D1 Database
- `FRIEND_CODE_DB` - フレンドコード保存

### Vectorize
- `GAME_VECTORIZE` - ゲーム名類似検索

### Workers AI
- `AI` - LLM & Embeddings

## 🌐 CORS設定

`CORS_ORIGINS` 環境変数で許可するオリジンを設定:
```
CORS_ORIGINS=https://recrubo.net,https://www.recrubo.net,https://dash.recrubo.net
```

## 🔐 認証

書き込み操作には `SERVICE_TOKEN` が必要:
```
Authorization: Bearer <SERVICE_TOKEN>
```

または
```
x-service-token: <SERVICE_TOKEN>
```

## 📝 関連ドキュメント

- [Friend Code機能セットアップ](../docs/FRIEND_CODE_WORKER_SETUP.md)
- [Grafana監視設定](../docs/Monitoring.md)

## 💡 統合の利点

✅ **単一Worker** - 管理が簡単、デプロイが高速
✅ **共通CORS** - オリジン設定を統一
✅ **統一認証** - サービストークンを共有
✅ **コスト削減** - Workerの数を最小化

## 📜 ライセンス

MIT
