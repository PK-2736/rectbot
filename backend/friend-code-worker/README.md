# Cloudflare Friend Code Worker

Workers AI + Vectorize + D1 を使用した Discord フレンドコード管理システム

## 🏗️ アーキテクチャ

```
User Input → Discord Bot → Worker API
                              ↓
                         [Workers AI (LLM)]
                              ↓
                         Game Name Normalization
                              ↓
                    [Vectorize Similarity Search]
                              ↓
                         [D1 Database]
                         - friend_codes
                         - game_name_cache
                         - game_usage_stats
```

## 📦 構成

- **Workers AI (LLM)**: ユーザー入力からゲーム名候補を生成
- **Vectorize**: embedding による類似ゲーム名検索
- **D1**: フレンドコード本体とキャッシュを保存
- **KV**: embedding メタデータ（オプション）

## 🚀 セットアップ

### 1. D1 データベース作成

```bash
wrangler d1 create friendcodes
```

出力された `database_id` を `wrangler.toml` に設定。

### 2. D1 スキーマ初期化

```bash
wrangler d1 execute friendcodes --file=./schema.sql
```

### 3. Vectorize インデックス作成

```bash
wrangler vectorize create game-names --dimensions=768 --metric=cosine
```

### 4. ゲーム辞書生成

```bash
cd scripts
node generate-game-embeddings.js
```

または Wrangler で cron 実行:

```bash
wrangler publish
wrangler tail # ログ確認
```

### 5. Worker デプロイ

```bash
wrangler deploy
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

フレンドコード追加

**Request:**
```json
{
  "userId": "123456789",
  "guildId": "987654321",
  "gameName": "Valorant",
  "friendCode": "Player#1234"
}
```

### GET /api/friend-code/get

フレンドコード取得

**Query:**
- `userId` (required)
- `guildId` (required)
- `gameName` (optional)

### DELETE /api/friend-code/delete

フレンドコード削除

**Request:**
```json
{
  "userId": "123456789",
  "guildId": "987654321",
  "gameName": "Valorant"
}
```

### GET /api/game/search

ゲーム名検索（オートコンプリート用）

**Query:**
- `q` (query string)

## 🧪 ローカル開発

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:8787` を開く。

## 📊 データフロー

### ゲーム名正規化フロー

```
1. ユーザー入力: "valo"
   ↓
2. D1 キャッシュチェック
   ↓ (miss)
3. Workers AI (LLM): "valo" → "Valorant"
   ↓
4. Vectorize embedding 生成
   ↓
5. Vectorize 類似検索
   ↓
6. Best match: "Valorant" (score: 0.98)
   ↓
7. D1 にキャッシュ保存
   ↓
8. 正規化結果を返す
```

## 🔧 トラブルシューティング

### Vectorize が空

```bash
# ゲーム辞書を再生成
node scripts/generate-game-embeddings.js
```

### D1 接続エラー

```bash
# database_id が正しいか確認
wrangler d1 list

# スキーマを再作成
wrangler d1 execute friendcodes --file=./schema.sql
```

### Workers AI レート制限

無料プランでは 1日あたりの制限があります。キャッシュヒット率を上げるために:
- D1 キャッシュを活用
- 人気ゲーム名を事前にインデックス

## 📈 パフォーマンス

- **キャッシュヒット**: ~5ms (D1 lookup)
- **AI 推論**: ~200-500ms (LLM + embedding)
- **Vectorize 検索**: ~50-100ms

## 🔐 セキュリティ

- CORS ヘッダー設定済み
- レート制限は Cloudflare Dashboard で設定
- 機密情報は `wrangler secret` で管理

```bash
wrangler secret put SERVICE_TOKEN
```

## 📝 ライセンス

MIT
