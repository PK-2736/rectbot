# 🎮 フレンドコード管理機能

## 概要
Discord内で募集相手とパーティーを組む際、自分のフレンドコードを毎回確認しに行かなくても、Botが保存したフレンドコードを簡単に表示できる機能です。

## 🚀 主な機能

### `/link-add` - フレンドコード登録
モーダルが表示され、ゲーム名とフレンドコードを入力して保存します。

**入力例:**
- ゲーム名: `Valorant`, `valo`, `ばろらんと` など
- フレンドコード: `Player#1234`, `SW-0000-0000-0000` など

**特徴:**
- 入力されたゲーム名を自動的に正規化して統一名で保存
- 曖昧な入力でも認識可能（例: `えぺ` → `apex legends`）

---

### `/link-show [user]` - フレンドコード表示
登録されているフレンドコード一覧を表示します。

**使用例:**
- `/link-show` - 自分のフレンドコード一覧を表示
- `/link-show @ユーザー` - 指定したユーザーのフレンドコード一覧を表示

**表示形式:**
```
🎮 ユーザー名 のフレンドコード

📌 valorant
```Player#1234```

📌 apex legends
```ApexPlayer#5678```
```

---

### `/link-delete <ゲーム名>` - フレンドコード削除
指定したゲームのフレンドコードを削除します。

**使用例:**
- `/link-delete valorant`

**特徴:**
- オートコンプリート機能で登録済みゲーム名を候補表示
- 削除前に存在確認を実施

---

### Botメンション機能
`@Bot <ゲーム名> @ユーザー` の形式でフレンドコードを素早く取得できます。

**使用例:**
```
@Bot valorant @Player1 @Player2
```

**結果:**
```
🎮 valorant のフレンドコード:

✅ Player1 (valorant): `Player1#1234`
✅ Player2 (valorant): `Player2#5678`
```

**複数ユーザー対応:**
- 一度に複数ユーザーのフレンドコードを取得可能
- 未登録ユーザーは個別に通知

---

## 🗂️ ディレクトリ構造

```
bot/src/
├── commands/
│   ├── linkAdd.js           # /link-add コマンド
│   ├── linkShow.js          # /link-show コマンド
│   └── linkDelete.js        # /link-delete コマンド
├── events/
│   ├── interactionCreate.js # インタラクション処理（モーダル・オートコンプリート）
│   └── messageCreate.js     # メンション検出とフレンドコード取得
├── utils/
│   ├── gameNameNormalizer.js # ゲーム名正規化ユーティリティ
│   └── db/
│       └── friendCode.js     # フレンドコードのRedis CRUD操作
```

---

## 🗄️ データ構造

### Redis Key構造
```
friend_code:{guildId}:{userId}:{normalizedGameName}
```

### 保存データ形式（JSON）
```json
{
  "code": "Player#1234",
  "gameName": "valorant",
  "originalInput": "valo",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

## 🎯 ゲーム名正規化システム

### 対応ゲーム（初期設定）
| 正式名称 | エイリアス例 |
|---------|------------|
| valorant | valo, val, ばろらんと, ヴァロ |
| apex legends | apex, えぺ, エーペックス |
| fortnite | fn, fort, フォトナ, フォートナイト |
| minecraft | mc, マイクラ, まいくら |
| league of legends | lol, ろる |
| overwatch | ow, オーバーウォッチ |
| genshin impact | 原神, げんしん, genshin |
| splatoon | スプラ, すぷら, スプラトゥーン |
| monster hunter | モンハン, もんはん, mh |
| final fantasy xiv | ff14, ffxiv |

### 正規化アルゴリズム
1. **完全一致チェック** - 正式名称との完全一致（信頼度: 1.0）
2. **エイリアス一致** - 登録済みエイリアスとの一致（信頼度: 0.95）
3. **前方一致** - 正式名称またはエイリアスの前方一致（信頼度: 0.85-0.8）
4. **部分一致** - 含まれているかの曖昧検索（信頼度: 0.7-0.65）
5. **未登録** - 入力値をそのまま使用（信頼度: 0.5）

---

## 🔧 拡張方法

### 新しいゲームを追加
`bot/src/utils/gameNameNormalizer.js` の `GAME_DICTIONARY` に追加:

```javascript
const GAME_DICTIONARY = {
  // 既存のゲーム...
  'new game': ['ng', 'newgame', 'ニューゲーム'],
};
```

### 動的にエイリアスを追加
```javascript
const { addGameAliases } = require('../utils/gameNameNormalizer');
addGameAliases('valorant', ['ばろ', 'valolant']);
```

---

## 📊 使用例フロー

### 登録フロー
1. ユーザーが `/link-add` を実行
2. モーダルが表示される
3. 「valo」と「Player#1234」を入力
4. システムが「valo」→「valorant」に正規化
5. Redis に保存: `friend_code:123456:789012:valorant`
6. 確認メッセージ表示

### 取得フロー（メンション）
1. ユーザーが `@Bot valo @Player1 @Player2` を送信
2. Bot がメンション検出
3. 「valo」→「valorant」に正規化
4. 各ユーザーのRedisデータを取得
5. フォーマットして返信

---

## ⚠️ 注意事項

- **ギルド単位でデータ管理**: 同じユーザーでも異なるサーバーで別々に管理
- **ゲーム名の大文字小文字**: 自動的に正規化されるため区別不要
- **信頼度が低い場合**: システムが警告メッセージを表示
- **未登録ゲーム**: 入力値をそのまま保存（後で正式名称に統一可能）

---

## 🚀 セットアップ

### 1. コマンド登録
新しいコマンドをDiscordに登録:
```bash
node bot/src/deploy-commands.js
```

### 2. Redisの確認
Redisサーバーが起動していることを確認:
```bash
redis-cli ping
# 結果: PONG
```

### 3. Botの再起動
変更を反映するためBotを再起動:
```bash
pm2 restart bot
```

---

## 🛠️ トラブルシューティング

### モーダルが表示されない
- Bot権限を確認: `applications.commands` スコープが必要
- コマンドが正しく登録されているか確認

### ゲーム名が認識されない
- `GAME_DICTIONARY` に追加
- 入力ログを確認して正規化結果をデバッグ

### フレンドコードが保存されない
- Redisの接続を確認
- `redis.set()` のエラーログを確認

---

## 📝 今後の拡張案

- [ ] Workers AI統合（より高度な自然言語解析）
- [ ] Cloudflare KVへの移行（グローバル同期）
- [ ] フレンドコードのQRコード生成
- [ ] ゲーム別統計情報の表示
- [ ] 一括エクスポート/インポート機能
