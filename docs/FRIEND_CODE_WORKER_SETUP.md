# 🎮 Discord Friend Code Manager

**Workers AI + Vectorize + D1** を使用したフレンドコード管理システム

## 🏗️ アーキテクチャ概要

```
Discord User
     ↓
Discord Bot (Node.js)
     ↓
Cloudflare Worker API
     ↓
┌─────────────────┬──────────────────┬─────────────┐
│  Workers AI     │   Vectorize      │     D1      │
│  (LLM判定)      │  (類似検索)       │ (データ保存)  │
└─────────────────┴──────────────────┴─────────────┘
```

### データフロー

1. **ユーザー入力**: 「valo」「えぺ」「マイクラ」などの曖昧な入力
2. **Workers AI (LLM)**: 入力からゲーム名候補を生成
3. **Vectorize**: embedding による類似ゲーム検索
4. **D1 キャッシュ**: 正規化結果をキャッシュして高速化
5. **D1 保存**: フレンドコード本体を保存

## 📁 ディレクトリ構成

```
backend/friend-code-worker/        # Cloudflare Worker
├── src/
│   ├── index.js                  # メインエントリーポイント
│   ├── routes/                   # APIルート
│   │   ├── normalizeGameName.js  # ゲーム名正規化
│   │   ├── addFriendCode.js      # フレンドコード追加
│   │   ├── getFriendCodes.js     # フレンドコード取得
│   │   ├── deleteFriendCode.js   # フレンドコード削除
│   │   └── searchGameNames.js    # ゲーム名検索
│   ├── ai/                       # AI関連
│   │   ├── llm.js                # Workers AI (LLM)
│   │   └── vectorize.js          # Vectorize操作
│   ├── db/                       # D1操作
│   │   ├── cache.js              # キャッシュ管理
│   │   └── friendCodes.js        # CRUD操作
│   └── utils/
│       └── response.js           # レスポンスユーティリティ
├── scripts/
│   └── generate-game-embeddings.js  # ゲーム辞書自動生成
├── schema.sql                    # D1スキーマ
├── wrangler.toml                 # Cloudflare設定
└── package.json

bot/src/                          # Discord Bot
├── commands/
│   ├── linkAdd.js                # /link-add
│   ├── linkShow.js               # /link-show
│   └── linkDelete.js             # /link-delete
├── events/
│   └── messageCreate.js          # @Bot mention検出
└── utils/
    └── workerApiClient.js        # Worker API クライアント
```

## 🚀 セットアップ手順

### 1. Cloudflare Worker のセットアップ

```bash
cd backend/friend-code-worker

# 依存関係インストール
npm install

# D1 データベース作成
wrangler d1 create friendcodes

# 出力された database_id を wrangler.toml に設定

# D1 スキーマ初期化
wrangler d1 execute friendcodes --file=./schema.sql

# Vectorize インデックス作成
wrangler vectorize create game-names --dimensions=768 --metric=cosine

# KV 作成（オプション）
wrangler kv:namespace create "GAMES"
```

### 2. ゲーム辞書の生成

```bash
# ゲーム名を Vectorize にインデックス
node scripts/generate-game-embeddings.js
```

### 3. Worker デプロイ

```bash
wrangler deploy
```

デプロイ後、Worker URL をメモ:
```
https://friend-code-worker.your-subdomain.workers.dev
```

### 4. Discord Bot 環境変数設定

`.env` に Worker URL を追加:

```env
FRIEND_CODE_WORKER_URL=https://friend-code-worker.your-subdomain.workers.dev
```

### 5. Discord コマンド登録

```bash
cd bot
node src/deploy-commands.js
```

### 6. Bot 再起動

```bash
pm2 restart bot
```

## 📡 API エンドポイント

### POST /api/game/normalize

ゲーム名を正規化

**Request:**
```json
{
  "input": "valo",
  "userId": "123456789",
  "guildId": "987654321"
}
```

**Response:**
```json
{
  "normalized": "Valorant",
  "confidence": 0.95,
  "method": "ai",
  "vectorizeMatches": [
    { "id": "valorant", "score": 0.98, "gameName": "Valorant" }
  ]
}
```

### POST /api/friend-code/add

```json
{
  "userId": "123456789",
  "guildId": "987654321",
  "gameName": "Valorant",
  "friendCode": "Player#1234"
}
```

### GET /api/friend-code/get

**Query Params:**
- `userId` (required)
- `guildId` (required)
- `gameName` (optional)

### DELETE /api/friend-code/delete

```json
{
  "userId": "123456789",
  "guildId": "987654321",
  "gameName": "Valorant"
}
```

## 🎮 Discord コマンド

### `/link-add`

フレンドコードを登録。モーダルが表示され、ゲーム名とコードを入力。

**AI判定の流れ:**
1. 入力: 「valo」
2. Workers AI: 「valo」→ 「Valorant」
3. Vectorize: 類似度 0.98
4. D1 に保存

### `/link-show [@user]`

フレンドコード一覧を表示。

### `/link-delete <game>`

フレンドコードを削除。オートコンプリートで候補表示。

### `@Bot <game> @user1 @user2`

メンションでフレンドコードを取得。

**例:**
```
@Bot valorant @Player1 @Player2
```

## ⚡ パフォーマンス

| 処理 | 応答時間 |
|------|---------|
| キャッシュヒット (D1) | ~5-10ms |
| AI推論 (LLM) | ~200-500ms |
| Vectorize 検索 | ~50-100ms |
| D1 保存 | ~10-20ms |

## 🔧 トラブルシューティング

### Worker API に接続できない

```bash
# Worker が起動しているか確認
wrangler tail

# ログを確認
wrangler tail --format pretty
```

### Vectorize が空

```bash
# ゲーム辞書を再生成
cd backend/friend-code-worker
node scripts/generate-game-embeddings.js
```

### D1 データが見つからない

```bash
# D1 データを確認
wrangler d1 execute friendcodes --command "SELECT * FROM friend_codes LIMIT 10"

# キャッシュを確認
wrangler d1 execute friendcodes --command "SELECT * FROM game_name_cache LIMIT 10"
```

### AI 判定の精度が低い

```bash
# より多くのゲームをインデックス
# scripts/generate-game-embeddings.js のゲームリストを拡張
```

## 📊 データベーススキーマ

### friend_codes

| カラム | 型 | 説明 |
|--------|---|------|
| id | INTEGER | 主キー |
| user_id | TEXT | Discord ユーザーID |
| guild_id | TEXT | Discord サーバーID |
| game_name | TEXT | 正規化されたゲーム名 |
| friend_code | TEXT | フレンドコード |
| created_at | TEXT | 作成日時 |
| updated_at | TEXT | 更新日時 |

### game_name_cache

| カラム | 型 | 説明 |
|--------|---|------|
| id | INTEGER | 主キー |
| input_name | TEXT | ユーザー入力 |
| normalized_name | TEXT | 正規化名 |
| confidence | REAL | 信頼度 (0.0-1.0) |
| created_at | TEXT | 作成日時 |

### game_usage_stats

| カラム | 型 | 説明 |
|--------|---|------|
| game_name | TEXT | ゲーム名 (主キー) |
| usage_count | INTEGER | 使用回数 |
| last_used_at | TEXT | 最終使用日時 |

## 🔐 セキュリティ

- CORS ヘッダー設定済み
- レート制限は Cloudflare Dashboard で設定
- 機密情報は環境変数で管理

## 💰 コスト

Cloudflare 無料プランで利用可能:

- **Workers AI**: 10,000 リクエスト/日
- **Vectorize**: 3000万 クエリ/月
- **D1**: 5GB ストレージ、500万 行読み取り/日
- **KV**: 100,000 読み取り/日

## 📝 ライセンス

MIT
